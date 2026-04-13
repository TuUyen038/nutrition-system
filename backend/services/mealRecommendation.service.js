/**
 * mealRecommendation.service.js
 *
 * Hai hàm public:
 *  - recommendDayPlan(userId, options)   → thực đơn 1 ngày
 *  - recommendWeekPlan(userId, options)  → thực đơn 7 ngày
 *
 * Cải tiến so với phiên bản cũ:
 *  1. Softmax-weighted sampling thay random top-3
 *  2. Protein-source diversity tracking (trong ngày & trong tuần)
 *  3. Category diversity penalty (tránh lặp category liên tiếp)
 *  4. Weekly rolling memory (lấy từ MealLog 7 ngày gần nhất)
 *  5. Favourite boost (ưu tiên món user yêu thích)
 *  6. Hard constraints: allergies, dietary restrictions
 *  7. Goal-aware penalty (is_fried nặng hơn với lose_weight)
 *  8. Debt weighting theo goal profile
 *  9. One-dish vs Combo logic thực sự
 * 10. Optional slots có điều kiện (dessert chỉ khi còn calo dư)
 */

const mongoose = require("mongoose");
const Recipe = require("../models/Recipe");
const MealLog = require("../models/MealLog");
const NutritionGoal = require("../models/NutritionGoal");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const MEAL_SPLIT = {
  breakfast: 0.25,
  lunch: 0.4,
  dinner: 0.35,
};

/**
 * cal_f  : hệ số nhân TDEE
 * p/f/c  : tỷ lệ macro (protein/fat/carbs)
 * friedPenaltyBase : mức phạt cơ bản cho món chiên rán
 * debtImportance   : weight khi điều chỉnh rolling debt
 */
const GOAL_PROFILES = {
  lose_weight: {
    cal_f: 0.8,
    p: 0.35,
    f: 0.25,
    c: 0.4,
    friedPenaltyBase: 0.5,
    debtImportance: { calories: 1.2, protein: 1.5, fat: 1.0, carbs: 0.7 },
  },
  maintain_weight: {
    cal_f: 1.0,
    p: 0.2,
    f: 0.3,
    c: 0.5,
    friedPenaltyBase: 0.25,
    debtImportance: { calories: 1.0, protein: 1.0, fat: 1.0, carbs: 1.0 },
  },
  gain_weight: {
    cal_f: 1.15,
    p: 0.25,
    f: 0.25,
    c: 0.5,
    friedPenaltyBase: 0.1,
    debtImportance: { calories: 1.0, protein: 1.8, fat: 0.8, carbs: 1.2 },
  },
};

// Fallback nếu user chưa set goal
const DEFAULT_GOAL = "maintain_weight";

// Tăng weight fat & carbs để scoring cân bằng macro tốt hơn
const NUTRITION_WEIGHTS = { calories: 2.0, protein: 2.0, fat: 1.8, carbs: 1.5 };
const TOTAL_W = Object.values(NUTRITION_WEIGHTS).reduce((a, b) => a + b, 0);

// Calo tối đa cho phép per category (dùng để normalize scale)
const MAX_CALO_PER_CAT = {
  main: 550,
  base_starch: 350,
  side_dish: 200,
  soup_veg: 200, // tăng từ 150 → 200 (tránh scale quá thấp)
  one_dish_meal: 600,
  dessert: 120,
  light_supplement: 250,
};

// Số ngày lùi để lấy lịch sử tránh lặp món
const HISTORY_LOOKBACK_DAYS = 7;

// Softmax temperature: cao → phân phối đều hơn, thấp → thiên về top
const SOFTMAX_TEMP = 6.0;

// Protein source từ tên/tag của recipe (có thể extend thêm)
const PROTEIN_SOURCE_KEYWORDS = {
  chicken: ["gà", "chicken", "ức gà", "đùi gà"],
  pork: ["heo", "lợn", "pork", "sườn", "ba chỉ"],
  beef: ["bò", "beef", "thịt bò"],
  seafood: ["cá", "tôm", "mực", "cua", "hải sản", "fish", "shrimp"],
  egg: ["trứng", "egg"],
  tofu: ["đậu phụ", "tofu", "đậu hũ"],

  pho: ["phở", "pho"],
  bun: ["bún", "bun"],
  mi: ["mì"],
};

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────

/** Chuẩn hoá về UTC midnight để so sánh date-only */
function toDateOnly(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

/** Detect protein source từ tên món hoặc tags */
function detectProteinSource(recipe) {
  if (recipe.proteinSource) return recipe.proteinSource;
  const text = (
    recipe.name +
    " " +
    (recipe.tags || []).join(" ")
  ).toLowerCase();
  for (const [source, keywords] of Object.entries(PROTEIN_SOURCE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return source;
  }
  return "other";
}

/** Scale nutrition của một recipe về mức hợp lý */
function getNormalizedScale(item) {
  const cat = item.category || "unknown";
  const rawCal = item.nutri?.calories || 0;
  const threshold = MAX_CALO_PER_CAT[cat];
  if (!threshold || rawCal <= 0) return 1.0;
  return rawCal > threshold ? threshold / rawCal : 1.0;
}

function getScaledNutri(item, scaleOverride = null) {
  const n = item.nutri || {};
  const scale =
    scaleOverride !== null ? scaleOverride : getNormalizedScale(item);
  return {
    scaled: {
      calories: (n.calories || 0) * scale,
      protein: (n.protein || 0) * scale,
      fat: (n.fat || 0) * scale,
      carbs: (n.carbs || 0) * scale,
    },
    scale,
  };
}

/** Gaussian fitness score: càng gần target → càng cao */
function gaussianScore(itemNutri, targetVec) {
  let sse = 0.0;
  for (const [key, w] of Object.entries(NUTRITION_WEIGHTS)) {
    const t = targetVec[key] || 1;
    const a = itemNutri[key] || 0;
    sse += w * Math.pow((a - t) / t, 2);
  }
  return Math.exp((-0.5 * sse) / TOTAL_W);
}

/**
 * Weighted random sampling dựa theo softmax của scores.
 * Tránh việc random đều trong top-N khiến món kém phù hợp
 * có xác suất bằng món tốt nhất.
 */
function softmaxSample(scoredItems, temp = SOFTMAX_TEMP) {
  if (scoredItems.length === 0) return null;
  if (scoredItems.length === 1) return scoredItems[0].item;

  const top = scoredItems.slice(0, Math.min(scoredItems.length, 8));
  const exps = top.map((x) => Math.exp(x.score * temp));
  const total = exps.reduce((a, b) => a + b, 0);

  let r = Math.random() * total;
  for (let i = 0; i < top.length; i++) {
    r -= exps[i];
    if (r <= 0) return top[i].item;
  }
  return top[0].item;
}

/** Tổng hợp nutrition của danh sách items */
function sumNutrition(items) {
  return items.reduce(
    (acc, r) => {
      const { scaled } = getScaledNutri(r);
      acc.calories += scaled.calories;
      acc.protein += scaled.protein;
      acc.fat += scaled.fat;
      acc.carbs += scaled.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

// ─────────────────────────────────────────────────────────────
// CORE PICKER
// ─────────────────────────────────────────────────────────────

/**
 * Lấy danh sách món đã ăn kèm theo số ngày cách đây.
 * Trả về: Map { "Tên món" => số ngày cách đây }
 */
async function getRecentlyEatenMap(userId, lookbackDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const logs = await MealLog.find({
    userId,
    date: { $gte: since },
  }).sort({ date: -1 }).lean(); // Lấy từ mới nhất đến cũ nhất

  const eatenMap = new Map();
  const today = toDateOnly(new Date());

  logs.forEach((log) => {
    const logDate = toDateOnly(log.date);
    const diffDays = Math.ceil((today - logDate) / (1000 * 60 * 60 * 24));

    log.meals?.forEach((meal) => {
      meal.items?.forEach((item) => {
        // Chỉ lưu ngày gần nhất nếu món đó xuất hiện nhiều lần
        if (!eatenMap.has(item.name)) {
          eatenMap.set(item.name, diffDays);
        }
      });
    });
  });
  return eatenMap;
}

/**
 * Chọn 1 món từ pool với đầy đủ scoring:
 *
 * finalScore = 0.50 * nutritionFit
 *            + 0.20 * favouriteBoost
 *            + 0.15 * noveltyScore       (chưa ăn gần đây)
 *            + 0.15 * diversityScore     (khác protein source & category)
 *            - goalPenalty               (chiên rán theo goal)
 *
 * @param {Object[]} pool              - toàn bộ recipes đã normalize
 * @param {string|string[]} categories - category được phép
 * @param {Object} targetVec           - nutrition target cho slot này
 * @param {Object} context             - { usedNames, usedProteinSources, usedCategories,
 *                                        favouriteIds, goal, mealType }
 */
function pickOne(pool, categories, targetVec, context) {
  const {
    usedNames = new Set(),
    usedProteinSources = new Map(), // source → count
    usedCategories = new Map(), // category → count
    favouriteIds = new Set(),
    goal = DEFAULT_GOAL,
    mealType = "lunch",
    recentEatenMap = new Map(),
  } = context;

  const allowedCats = Array.isArray(categories) ? categories : [categories];
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES[DEFAULT_GOAL];

  const subPool = pool.filter(
    (r) => allowedCats.includes(r.category)
  );
  if (subPool.length === 0) return null;

  const scored = subPool.map((item) => {
    const { scaled } = getScaledNutri(item);
    const proteinSrc = detectProteinSource(item);

    // 1. Nutrition fitness
    const nutritionFit = gaussianScore(scaled, targetVec);

    // 2. Favourite boost
    const favouriteBoost = favouriteIds.has(String(item._id)) ? 1.0 : 0.0;

    // 3. Novelty
    let noveltyScore = 1.0;
    
    if (usedNames.has(item.name)) {
      // Nếu đã chọn trong cùng một ngày (ví dụ sáng ăn phở, trưa không nên ăn phở tiếp)
      noveltyScore = 0.0; 
    } else if (recentEatenMap.has(item.name)) {
      const daysAgo = recentEatenMap.get(item.name);
      // Công thức: Càng lâu chưa ăn thì điểm càng cao
      // 1 ngày trước: 0.1 | 3 ngày trước: 0.4 | 7 ngày trước: 0.8 | >10 ngày: 1.0
      noveltyScore = Math.min(1.0, daysAgo * 0.12); 
    }

    // 4. Diversity: protein source
    const proteinCount = usedProteinSources.get(proteinSrc) || 0;
    const proteinDiversity = Math.max(0, 1.0 - proteinCount * 0.35);

    // 5. Diversity: category
    const catCount = usedCategories.get(item.category) || 0;
    const catDiversity = Math.max(0, 1.0 - catCount * 0.25);

    const diversityScore = (proteinDiversity + catDiversity) / 2;

    // 6. Goal-based penalty (chiên rán)
    const friedPenalty = item.is_fried
      ? profile.friedPenaltyBase * (mealType === "dinner" ? 1.5 : 1.0)
      : 0.0;

    const finalScore =
      0.5 * nutritionFit +
      0.2 * favouriteBoost +
      0.15 * noveltyScore +
      0.15 * diversityScore -
      friedPenalty;

    return { score: Math.max(0, finalScore), item };
  });

  scored.sort((a, b) => b.score - a.score);
  return softmaxSample(scored);
}

/**
 * Tính toán target mới dựa trên "nợ" dinh dưỡng của 3 ngày hôm trước.
 */
async function getAdaptiveTarget(userId, originalTarget) {
  // 1. Lấy thông tin Goal của user trước
  const { goal } = await getUserNutritionProfile(userId);
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES.maintain_weight;
  const debtImportance = profile.debtImportance; // Lấy bảng trọng số ưu tiên

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const lastLog = await MealLog.findOne({ userId, date: toDateOnly(yesterday) }).lean();

  if (!lastLog) return originalTarget;

  const actual = lastLog.dailyTotalNutrition;
  const adaptiveTarget = { ...originalTarget };

  for (const k in originalTarget) {
    const diff = originalTarget[k] - actual[k];
    
    // Lấy trọng số ưu tiên cho từng loại macro (ví dụ Protein là 1.5, Carbs là 0.7)
    const importance = debtImportance[k] || 1.0;
    
    // Tính toán mức điều chỉnh có nhân thêm trọng số
    // Nếu nợ Protein, việc nhân 1.5 sẽ khiến mức bù mạnh mẽ hơn
    const rawAdjustment = diff * importance;

    // Vẫn giữ giới hạn 15% để đảm bảo thực đơn không bị biến dạng quá mức
    const maxAdj = originalTarget[k] * 0.15;
    const finalAdjustment = Math.max(-maxAdj, Math.min(maxAdj, rawAdjustment));
    
    adaptiveTarget[k] = parseFloat((originalTarget[k] + finalAdjustment).toFixed(1));
  }

  return adaptiveTarget;
}

// ─────────────────────────────────────────────────────────────
// BUILD MEAL (1 bữa)
// ─────────────────────────────────────────────────────────────

/**
 * Xây dựng 1 bữa ăn hoàn chỉnh dựa vào mealType.
 * Trả về { items, totalNutrition }
 */
function buildMeal(pool, mealType, adjTarget, context) {
  const chosen = [];

  if (mealType === "breakfast") {
    // Breakfast: ưu tiên one_dish_meal, fallback combo nhẹ
    const oneDish = pickOne(pool, ["one_dish_meal"], adjTarget, {
      ...context,
      mealType,
    });

    if (oneDish) {
      chosen.push(oneDish);
      // Kèm thêm món phụ nếu calo còn dư
      let currentCal = sumNutrition(chosen).calories;
      if ((adjTarget.calories - currentCal) / adjTarget.calories > 0.2) {
        const side = pickOne(
          pool,
          ["light_supplement"],
          { calories: adjTarget.calories * 0.2 },
          { ...context, mealType },
        );
        if (side) chosen.push(side);
      }
      currentCal = sumNutrition(chosen).calories;
      if ((adjTarget.calories - currentCal) / adjTarget.calories > 0.15) {
        const side = pickOne(
          pool,
          ["drink", "dessert", "fruit"],
          { calories: adjTarget.calories * 0.15 },
          { ...context, mealType },
        );
        if (side) chosen.push(side);
      }
    } else {
      // Fallback: base_starch + light_supplement
      const main = pickOne(
        pool,
        ["main"],
        { ...adjTarget, calories: adjTarget.calories * 0.45 },
        { ...context, mealType },
      );
      const starch = pickOne(
        pool,
        ["base_starch"],
        { ...adjTarget, calories: adjTarget.calories * 0.35 },
        { ...context, mealType },
      );
      const side = pickOne(
        pool,
        ["soup_veg"],
        { ...adjTarget, calories: adjTarget.calories * 0.2 },
        { ...context, mealType },
      );
      if (main) chosen.push(main);
      if (starch) chosen.push(starch);
      if (side) chosen.push(side);

      // light_supplement: thêm nếu >30%
      let currentCal = sumNutrition(chosen).calories;
      let remainRatio = (adjTarget.calories - currentCal) / adjTarget.calories;
      if (remainRatio > 0.15) {
        const dessert = pickOne(
          pool,
          ["light_supplement"],
          { calories: adjTarget.calories * remainRatio * 0.5 },
          { ...context, mealType },
        );
        if (dessert) chosen.push(dessert);
      }

      // Dessert: chỉ thêm nếu còn calo dư > 15%
      currentCal = sumNutrition(chosen).calories;
      remainRatio = (adjTarget.calories - currentCal) / adjTarget.calories;
      if (remainRatio > 0.15) {
        const dessert = pickOne(
          pool,
          ["dessert", "drink", "fruit"],
          { calories: adjTarget.calories * remainRatio * 0.5 },
          { ...context, mealType },
        );
        if (dessert) chosen.push(dessert);
      }
    }
  } else {
    // Lunch / Dinner: 60% combo, 40% one-dish
    const useCombo = Math.random() < 0.6;

    if (useCombo) {
      const main = pickOne(
        pool,
        ["main"],
        { ...adjTarget, calories: adjTarget.calories * 0.45 },
        { ...context, mealType },
      );
      const starch = pickOne(
        pool,
        ["base_starch"],
        { ...adjTarget, calories: adjTarget.calories * 0.35 },
        { ...context, mealType },
      );
      const side = pickOne(
        pool,
        ["soup_veg", "side"],
        { ...adjTarget, calories: adjTarget.calories * 0.2 },
        { ...context, mealType },
      );
      if (main) chosen.push(main);
      if (starch) chosen.push(starch);
      if (side) chosen.push(side);

      // side: thêm nếu >30%
      let currentCal = sumNutrition(chosen).calories;
      let remainRatio = (adjTarget.calories - currentCal) / adjTarget.calories;
      if (remainRatio > 0.15) {
        const dessert = pickOne(
          pool,
          ["side"],
          { calories: adjTarget.calories * remainRatio * 0.5 },
          { ...context, mealType },
        );
        if (dessert) chosen.push(dessert);
      }

      // Dessert: chỉ thêm nếu còn calo dư > 15%
      currentCal = sumNutrition(chosen).calories;
      remainRatio = (adjTarget.calories - currentCal) / adjTarget.calories;
      if (remainRatio > 0.15) {
        const dessert = pickOne(
          pool,
          ["dessert", "light_supplement"],
          { calories: adjTarget.calories * remainRatio * 0.5 },
          { ...context, mealType },
        );
        if (dessert) chosen.push(dessert);
      }
    } else {
      // One-dish meal (cơm tấm, bún bò, phở...)
      const oneDish = pickOne(pool, ["one_dish_meal"], adjTarget, {
        ...context,
        mealType,
      });
      if (oneDish) chosen.push(oneDish);

      // Kèm thêm món phụ nếu calo còn dư
      let currentCal = sumNutrition(chosen).calories;
      if ((adjTarget.calories - currentCal) / adjTarget.calories > 0.4) {
        const side = pickOne(
          pool,
          ["side"],
          { calories: adjTarget.calories * 0.4 },
          { ...context, mealType },
        );
        if (side) chosen.push(side);
      }

      //kèm trái cây
      currentCal = sumNutrition(chosen).calories;
      if ((adjTarget.calories - currentCal) / adjTarget.calories > 0.2) {
        const side = pickOne(
          pool,
          ["fruit", "light_supplement"],
          { calories: adjTarget.calories * 0.2 },
          { ...context, mealType },
        );
        if (side) chosen.push(side);
      }
    }
  }

  // Cập nhật context (mutation in place để shared giữa các bữa trong ngày)
  chosen.forEach((r) => {
    context.usedNames.add(r.name);

    const src = detectProteinSource(r);
    context.usedProteinSources.set(
      src,
      (context.usedProteinSources.get(src) || 0) + 1,
    );
    context.usedCategories.set(
      r.category,
      (context.usedCategories.get(r.category) || 0) + 1,
    );
  });

  // Tính totalNutrition từ scaled values (source of truth)
  // Đồng thời cache scaled per item để items[].nutrition nhất quán với total
  const itemsWithScaled = chosen.map((r) => {
    const { scaled, scale } = getScaledNutri(r);
    return { r, scaled, scale };
  });

  const totalNutrition = itemsWithScaled.reduce(
    (acc, { scaled }) => {
      acc.calories += scaled.calories;
      acc.protein += scaled.protein;
      acc.fat += scaled.fat;
      acc.carbs += scaled.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  // Round totalNutrition
  for (const k in totalNutrition) {
    totalNutrition[k] = parseFloat(totalNutrition[k].toFixed(1));
  }

  return {
    mealType,
    items: itemsWithScaled.map(({ r, scaled, scale }) => ({
      recipeId: r._id,
      name: r.name,
      category: r.category,
      scale: parseFloat(scale.toFixed(3)),
      proteinSource: detectProteinSource(r),
      // nutrition = scaled values → nhất quán với totalNutrition
      nutrition: {
        calories: parseFloat(scaled.calories.toFixed(1)),
        protein: parseFloat(scaled.protein.toFixed(1)),
        fat: parseFloat(scaled.fat.toFixed(1)),
        carbs: parseFloat(scaled.carbs.toFixed(1)),
      },
    })),
    totalNutrition,
  };
}

// ─────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────

/** Lấy NutritionGoal active của user, fallback tính từ User profile */
async function getUserNutritionProfile(userId) {
  // Ưu tiên NutritionGoal active
  const ng = await NutritionGoal.findOne({ userId, status: "active" }).lean();
  if (ng) {
    return {
      tdee: ng.tdee?.calories || 2000,
      goal: ng.bodySnapshot?.goal || DEFAULT_GOAL,
      target: ng.targetNutrition,
    };
  }

  // Fallback: lấy từ User và tính thô
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");

  const goal = user.goal || DEFAULT_GOAL;
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES[DEFAULT_GOAL];

  // Mifflin-St Jeor BMR estimate
  let bmr = 1700;
  if (user.weight && user.height && user.age) {
    if (user.gender === "male") {
      bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age + 5;
    } else {
      bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age - 161;
    }
  }
  const tdee = bmr * 1.375; // moderate activity default
  const dailyCal = tdee * profile.cal_f;

  return {
    tdee,
    goal,
    target: {
      calories: dailyCal,
      protein: (dailyCal * profile.p) / 4,
      fat: (dailyCal * profile.f) / 9,
      carbs: (dailyCal * profile.c) / 4,
    },
  };
}

// /** Lấy tên các món đã ăn trong N ngày gần đây (hard exclude) */
// async function getRecentlyEatenNames(userId, days = HISTORY_LOOKBACK_DAYS) {
//   const since = new Date();
//   since.setDate(since.getDate() - days);

//   const logs = await MealLog.find({
//     userId,
//     date: { $gte: since },
//   })
//     .select("meals.items.name")
//     .lean();

//   const names = new Set();
//   logs.forEach((log) =>
//     log.meals?.forEach((meal) =>
//       meal.items?.forEach((item) => names.add(item.name)),
//     ),
//   );
//   return names;
// }

/** Lấy Set favouriteIds từ User.favoriteRecipes */
async function getFavouriteIds(userId) {
  const user = await User.findById(userId).select("favoriteRecipes").lean();
  if (!user?.favoriteRecipes?.length) return new Set();
  return new Set(user.favoriteRecipes.map((id) => String(id)));
}

/** Normalize recipes từ DB sang format nội bộ */
function normalizeRecipes(rawRecipes, allergies = []) {
  const allergyLower = allergies.map((a) => a.toLowerCase());

  return rawRecipes
    .map((item) => ({
      ...item,
      nutri: {
        calories: parseFloat(item.totalNutritionPerServing?.calories || 0),
        protein: parseFloat(item.totalNutritionPerServing?.protein || 0),
        fat: parseFloat(item.totalNutritionPerServing?.fat || 0),
        carbs: parseFloat(item.totalNutritionPerServing?.carbs || 0),
      },
    }))
    .filter((r) => {
      if (r.nutri.calories <= 0) return false;
      // Hard constraint: loại bỏ món chứa dị ứng nguyên
      if (allergyLower.length > 0) {
        const recipeText = (
          r.name +
          " " +
          (r.ingredients || []).join(" ") +
          " " +
          (r.allergy_tags || []).join(" ")
        ).toLowerCase();
        if (allergyLower.some((a) => recipeText.includes(a))) return false;
      }
      return true;
    });
}

// ─────────────────────────────────────────────────────────────
// PLAN BUILDER (dùng chung cho day & week)
// ─────────────────────────────────────────────────────────────

/**
 * Tạo thực đơn 1 ngày.
 * @param {Object[]} recipes       - pool đã normalize
 * @param {Object}   dailyTarget   - { calories, protein, fat, carbs }
 * @param {string}   goal          - tên goal
 * @param {Object}   sharedContext - { usedNames, usedProteinSources, usedCategories,
 *                                     favouriteIds, hardExcludeNames }
 *                                   Context được MUTATE để chia sẻ state giữa các bữa/ngày
 */
function buildDayPlan(recipes, dailyTarget, goal, sharedContext) {
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES[DEFAULT_GOAL];
  const debt = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const dayMeals = [];

  for (const mealKey of ["breakfast", "lunch", "dinner"]) {
    // Base target của bữa này
    const baseTarget = {};
    for (const k in dailyTarget)
      baseTarget[k] = dailyTarget[k] * MEAL_SPLIT[mealKey];

    // Điều chỉnh rolling debt (có weighted theo goal)
    const adjTarget = {};
    const di = profile.debtImportance;
    for (const k in baseTarget) {
      const maxAdj = baseTarget[k] * 0.2;
      const importance = di[k] || 1.0;
      const adjVal = Math.max(
        -maxAdj,
        Math.min(maxAdj, ((debt[k] || 0) * importance) / 2),
      );
      adjTarget[k] = Math.max(0, baseTarget[k] + adjVal);
    }

    const meal = buildMeal(recipes, mealKey, adjTarget, {
      ...sharedContext,
      goal,
      mealType: mealKey,
    });
    dayMeals.push(meal);

    // Cập nhật debt
    for (const k in debt) {
      debt[k] = (debt[k] || 0) + baseTarget[k] - meal.totalNutrition[k];
    }
  }

  // Tính tổng ngày
  const dailyTotal = dayMeals.reduce(
    (acc, m) => {
      acc.calories += m.totalNutrition.calories;
      acc.protein += m.totalNutrition.protein;
      acc.fat += m.totalNutrition.fat;
      acc.carbs += m.totalNutrition.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  // Round
  for (const k in dailyTotal)
    dailyTotal[k] = parseFloat(dailyTotal[k].toFixed(1));

  return { meals: dayMeals, dailyTotal };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Gợi ý thực đơn 1 ngày cho user.
 *
 * @param {string|ObjectId} userId
 * @param {Object} options
 * @param {boolean} options.saveToDB   - có lưu MealLog không (default: false)
 * @param {Date}    options.date       - ngày cần gợi ý (default: hôm nay)
 *
 * @returns {Promise<Object>} {
 *   date, goal, target, meals, dailyTotal, savedLogId?
 * }
 */
async function recommendDayPlan(userId, options = {}) {
  const { saveToDB = false, date = new Date() } = options;

  // 1. Load user profile & nutrition target
  const {
    tdee,
    goal,
    target: dailyTarget,
  } = await getUserNutritionProfile(userId);
console.log("User target:", dailyTarget);
  // 2. ADAPTIVE STEP: Điều chỉnh target dựa trên thực tế hôm qua
  const adaptiveTarget = await getAdaptiveTarget(userId, dailyTarget);
console.log("Adaptive target:", adaptiveTarget);
  // 2. Load user data song song
  const [rawRecipes, recentNames, favouriteIds, user] = await Promise.all([
    Recipe.find({}).lean(),
    getRecentlyEatenMap(userId, HISTORY_LOOKBACK_DAYS),
    getFavouriteIds(userId),
    User.findById(userId).select("allergies").lean(),
  ]);
console.log("Recently eaten:", Array.from(recentNames.entries()));
console.log("Favourite IDs:", favouriteIds);
console.log("User allergies:", user?.allergies || []);

  // 3. Normalize recipes + apply hard constraints
  const recipes = normalizeRecipes(rawRecipes, user?.allergies || []);

  // 4. Context chia sẻ trong ngày
  const dayContext = {
    usedNames: new Set(),
    usedProteinSources: new Map(),
    usedCategories: new Map(),
    favouriteIds,
    recentEatenMap: recentNames, // tránh món đã ăn 7 ngày gần đây
  };

  // 5. Build plan
  const { meals, dailyTotal } = buildDayPlan(
    recipes,
    adaptiveTarget,
    goal,
    dayContext,
  );

  // 6. Optionally save to DB
  let savedLogId = null;
  if (saveToDB) {
    const logDate = toDateOnly(date);
    // Upsert: nếu đã có log ngày này thì overwrite
    const logDoc = await MealLog.findOneAndUpdate(
      { userId, date: logDate },
      {
        userId,
        date: logDate,
        meals,
        dailyTotalNutrition: dailyTotal,
        source: "recommended",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    savedLogId = logDoc._id;
  }

  return {
    date: toDateOnly(date),
    goal,
    tdee: parseFloat(tdee.toFixed(0)),
    target: { ...dailyTarget },
    meals,
    dailyTotal,
    ...(savedLogId && { savedLogId }),
  };
}

/**
 * Gợi ý thực đơn 7 ngày cho user.
 *
 * @param {string|ObjectId} userId
 * @param {Object} options
 * @param {boolean} options.saveToDB    - có lưu MealLog không (default: false)
 * @param {Date}    options.startDate   - ngày bắt đầu (default: hôm nay)
 * @param {number}  options.days        - số ngày (default: 7, max: 14)
 *
 * @returns {Promise<Object>} {
 *   startDate, endDate, goal, target, weekPlan: [...dayPlans], weeklyTotal
 * }
 */
async function recommendWeekPlan(userId, options = {}) {
  const { saveToDB = false, startDate = new Date(), days = 7 } = options;
  const numDays = Math.min(Math.max(days, 1), 14);

  // 1. Load profile
  const {
    tdee,
    goal,
    target: dailyTarget,
  } = await getUserNutritionProfile(userId);

  // 2. Load data (1 lần cho cả tuần)
  const [rawRecipes, recentNames, favouriteIds, user] = await Promise.all([
    Recipe.find({}).lean(),
    getRecentlyEatenNames(userId),
    getFavouriteIds(userId),
    User.findById(userId).select("allergies").lean(),
  ]);

  const recipes = normalizeRecipes(rawRecipes, user?.allergies || []);

  // 3. Weekly context (shared ACROSS all days → tăng diversity liên ngày)
  const weekContext = {
    usedNames: new Set(),
    usedProteinSources: new Map(),
    usedCategories: new Map(),
    favouriteIds,
    hardExcludeNames: recentNames,
  };

  // 4. Build từng ngày
  const weekPlan = [];
  const logPromises = [];

  for (let i = 0; i < numDays; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + i);

    // Context per-day: protein source & category reset mỗi ngày
    // nhưng usedNames & hardExclude tích lũy cả tuần
    const dayContext = {
      usedNames: weekContext.usedNames, // shared → tránh lặp cả tuần
      usedProteinSources: new Map(), // reset mỗi ngày
      usedCategories: new Map(), // reset mỗi ngày
      favouriteIds: weekContext.favouriteIds,
      hardExcludeNames: weekContext.hardExcludeNames,
    };

    const { meals, dailyTotal } = buildDayPlan(
      recipes,
      dailyTarget,
      goal,
      dayContext,
    );

    weekPlan.push({
      dayIndex: i + 1,
      date: toDateOnly(dayDate),
      meals,
      dailyTotal,
    });

    if (saveToDB) {
      const logDate = toDateOnly(dayDate);
      logPromises.push(
        MealLog.findOneAndUpdate(
          { userId, date: logDate },
          {
            userId,
            date: logDate,
            meals,
            dailyTotalNutrition: dailyTotal,
            source: "recommended",
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ),
      );
    }
  }

  if (saveToDB) await Promise.all(logPromises);

  // 5. Tổng tuần
  const weeklyTotal = weekPlan.reduce(
    (acc, day) => {
      acc.calories += day.dailyTotal.calories;
      acc.protein += day.dailyTotal.protein;
      acc.fat += day.dailyTotal.fat;
      acc.carbs += day.dailyTotal.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
  for (const k in weeklyTotal)
    weeklyTotal[k] = parseFloat(weeklyTotal[k].toFixed(1));

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + numDays - 1);

  return {
    startDate: toDateOnly(startDate),
    endDate: toDateOnly(endDate),
    goal,
    tdee: parseFloat(tdee.toFixed(0)),
    dailyTarget,
    weekPlan,
    weeklyTotal,
    weeklyAverage: {
      calories: parseFloat((weeklyTotal.calories / numDays).toFixed(1)),
      protein: parseFloat((weeklyTotal.protein / numDays).toFixed(1)),
      fat: parseFloat((weeklyTotal.fat / numDays).toFixed(1)),
      carbs: parseFloat((weeklyTotal.carbs / numDays).toFixed(1)),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  recommendDayPlan,
  recommendWeekPlan,
};
