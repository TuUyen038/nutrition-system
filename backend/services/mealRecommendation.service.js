"use strict";

const mongoose = require("mongoose");
const Recipe = require("../models/Recipe");
const MealLog = require("../models/MealLog");
const NutritionGoal = require("../models/NutritionGoal");
const User = require("../models/User");
const DailyMenu = require("../models/DailyMenu");
const mealLogService = require("./mealLog.service");
const MealPlan = require("../models/MealPlan");
// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MEAL_SPLIT = {
  breakfast: 0.25,
  lunch: 0.4,
  dinner: 0.35,
};

/**
 * cal_f            : hệ số nhân TDEE
 * p/f/c            : tỷ lệ macro
 * friedPenaltyBase : phạt món chiên rán
 * debtImportance   : trọng số khi bù đắp nợ lịch sử (getAdaptiveTarget)
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

const DEFAULT_GOAL = "maintain_weight";

const NUTRITION_WEIGHTS = { calories: 2.0, protein: 2.0, fat: 1.8, carbs: 1.5 };

const MAX_CALO_PER_CAT = {
  main: 550,
  base_starch: 350,
  side_dish: 250, // tăng từ 200
  soup_veg: 200,
  one_dish_meal: 600,
  dessert: 200, // tăng từ 120
  light_supplement: 350, // tăng từ 250
};

const HISTORY_LOOKBACK_DAYS = 7;

/** Softmax temperature — cao → đều hơn, thấp → winner-takes-all */
const SOFTMAX_TEMP = 6.0;

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

const NUTRITION_DEFAULTS = {
  tdee: 2000,
  goal: DEFAULT_GOAL,
  target: {
    calories: 2000,
    protein: 150,
    fat: 67,
    carbs: 200,
    fiber: 25,
    sugar: 50,
    sodium: 2300,
  },
};

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

function detectMealSource(recipe) {
  if (recipe.mealSource) return recipe.mealSource;
  const text = (
    recipe.name +
    " " +
    (recipe.ingredients || []).map((i) => i.name || i.rawName || "").join(" ") +
    (Array.isArray(recipe.allergy_tags) ? recipe.allergy_tags : []).join(" ")
  ).toLowerCase();

  for (const [source, keywords] of Object.entries(PROTEIN_SOURCE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return source;
  }
  return "other";
}

function getNormalizedScale(item) {
  const rawCal = item.totalNutritionPerServing?.calories || 0;
  const threshold = MAX_CALO_PER_CAT[item.category];
  if (!threshold || rawCal <= 0) return 1.0;

  const scale = rawCal > threshold ? threshold / rawCal : 1.0;
  const SCALE_STEPS = [1.0, 0.75, 0.5, 0.25];
  for (const s of SCALE_STEPS) {
    if (scale >= s) return s;
  }
  return 0.25;
}

function getScaledNutri(item, scaleOverride = null) {
  const n = item.totalNutritionPerServing || {};
  const scale =
    scaleOverride !== null ? scaleOverride : getNormalizedScale(item);
  return {
    scaled: {
      calories: (n.calories || 0) * scale,
      protein: (n.protein || 0) * scale,
      fat: (n.fat || 0) * scale,
      carbs: (n.carbs || 0) * scale,
      //TODO: fiber/sugar/sodium
    },
    scale,
  };
}

/** Gaussian fitness: càng gần target → càng cao (0→1) */
function gaussianScore(itemNutri, targetVec) {
  let sse = 0.0,
    totalW = 0.0;
  for (const [key, w] of Object.entries(NUTRITION_WEIGHTS)) {
    const t = targetVec[key] || 1;
    const a = itemNutri[key] || 0;
    let diff = (a - t) / t;

    // Asymmetric penalties
    if (key === "protein") {
      // Nếu thừa Protein quá 20%, bắt đầu phạt nặng dần
      if (diff > 0.2) diff *= 4.0;
      // Nếu thiếu Protein, vẫn phạt cực nặng để đảm bảo cơ bắp
      else if (diff < 0) diff *= 5.0;
    } else if (key === "carbs") {
      // Nếu thiếu Carbs, phải phạt nặng để hệ thống đi tìm cơm/sắn/ngô
      if (diff < 0) diff *= 3.0;
      // Nếu thừa Carbs, phạt để tránh béo
      else if (diff > 0) diff *= 2.0;
    }
    sse += w * diff * diff;
    totalW += w;
  }
  // return Math.exp((-0.5 * sse) / totalW);
  const macroScore = Math.exp((-0.5 * sse) / totalW);

  // thêm calorie penalty riêng
  const calT = targetVec.calories || 1;
  const calA = itemNutri.calories || 0;
  let calDiff = (calA - calT) / calT;

  // asymmetric
  if (calDiff > 0)
    calDiff *= 2.0; // thừa cal phạt mạnh
  else calDiff *= 1.2; // thiếu cal phạt nhẹ hơn

  const calScore = Math.exp(-0.5 * calDiff * calDiff);

  // combine
  return macroScore * calScore;
}
/**
 * OPT-3: Novelty score dùng sigmoid thay linear → mượt hơn
 *   daysAgo=0 → 0.0 | 3 → 0.42 | 7 → 0.73 | 14 → 0.93
 */
function noveltyFromDays(daysAgo) {
  return 1 - 1 / (1 + 0.35 * daysAgo);
}

/**
 * Weighted sampling theo softmax của scores.
 * OPT-5: excludeNames loại ngay trước khi score để tiết kiệm compute.
 */
function softmaxSample(scoredItems, temp = SOFTMAX_TEMP) {
  if (!scoredItems.length) return null;
  if (scoredItems.length === 1) return scoredItems[0].item;

  const top = scoredItems.slice(0, Math.min(scoredItems.length, 8));
  const exps = top.map((x) => Math.exp(x.score * temp));
  const sum = exps.reduce((a, b) => a + b, 0);

  let r = Math.random() * sum;
  for (let i = 0; i < top.length; i++) {
    r -= exps[i];
    if (r <= 0) return top[i].item;
  }
  return top[0].item;
}

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
// OPT-4: Category pool cache
// Tránh filter O(n) lặp lại trong mỗi pickOne call.
// ─────────────────────────────────────────────────────────────

function buildPoolCache(pool) {
  const cache = new Map();
  for (const item of pool) {
    const cat = item.category || "unknown";
    if (!cache.has(cat)) cache.set(cat, []);
    cache.get(cat).push(item);
  }
  return cache;
}

// ─────────────────────────────────────────────────────────────
// CORE PICKER
// ─────────────────────────────────────────────────────────────

/**
 * Lấy lịch sử ăn uống gần đây.
 * @returns {Map<string, number>}  name → daysAgo
 */

/**
 * Chọn 1 món từ pool theo scoring đa tiêu chí.
 *
 * finalScore = 0.60 * nutritionFit
 *            + 0.20 * favouriteBoost
 *            + 0.10 * noveltyScore
 *            + 0.10 * diversityScore
 *            - friedPenalty
 *            - adaptiveCarbsPenalty   ← FIX-2: giờ hoạt động đúng
 *
 * @param {Map}      poolCache         - OPT-4 pre-built category → items[]
 * @param {string[]} categories
 * @param {Object}   targetVec
 * @param {Object}   context
 */
function pickOne(poolCache, categories, targetVec, context) {
  const {
    usedNames = new Set(),
    usedMealSources = new Map(),
    usedCategories = new Map(),
    favouriteIds = new Set(),
    goal = DEFAULT_GOAL,
    mealType = "lunch",
    recentEatenMap = new Map(),
    accumulatedNutrition = { calories: 0, protein: 0, fat: 0, carbs: 0 },
    accumulatedRatio = { calories: 0, protein: 0, fat: 0, carbs: 0 },
    mealTarget = {},
  } = context;

  const allowedCats = Array.isArray(categories) ? categories : [categories];
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES[DEFAULT_GOAL];

  // OPT-4: lấy sub-pool từ cache, O(k) thay vì O(n)
  const subPool = allowedCats.flatMap((c) => poolCache.get(c) || []);
  if (!subPool.length) return null;

  const scored = subPool
    // OPT-5: loại hard exclusion trước khi score
    .filter((item) => !usedNames.has(item.name))
    .map((item) => {
      const { scaled } = getScaledNutri(item);
      const proteinSrc = detectMealSource(item);

      // 1. Nutrition fitness
      const nutritionFit = gaussianScore(scaled, targetVec);

      // 2. Favourite boost
      const favouriteBoost = favouriteIds.has(String(item._id)) ? 1.0 : 0.0;

      // 3. Novelty — OPT-3: sigmoid thay linear
      let noveltyScore = 1.0;
      if (recentEatenMap.has(item.name)) {
        const daysAgo = recentEatenMap.get(item.name);
        noveltyScore = noveltyFromDays(daysAgo);
      }

      // 4. Diversity: protein source
      const proteinCount = usedMealSources.get(proteinSrc) || 0;
      const proteinDiversity = Math.max(0, 1.0 - proteinCount * 0.35);

      // 5. Diversity: category
      const catCount = usedCategories.get(item.category) || 0;
      const catDiversity = Math.max(0, 1.0 - catCount * 0.25);

      const diversityScore = (proteinDiversity + catDiversity) / 2;

      // 6. Goal-based penalty (chiên rán)
      const friedPenalty = item.is_fried
        ? profile.friedPenaltyBase * (mealType === "dinner" ? 1.5 : 1.0)
        : 0.0;

      // 7. Enhanced: Overage penalty cho TẤT CẢ macros — nếu accumulated vượt quá → giảm score
      let overageMultiplier = 1.0;
      if (accumulatedRatio.calories > 0.95) overageMultiplier *= 0.7; // giảm 30% nếu calo >95%
      if (accumulatedRatio.protein > 1.1) overageMultiplier *= 0.5; // giảm 50% nếu protein >110%
      if (accumulatedRatio.fat > 1.05) overageMultiplier *= 0.6; // giảm 40% nếu fat >105%
      if (accumulatedRatio.carbs > 0.85 && item.category === "base_starch")
        overageMultiplier *= 0.3; // giảm 70% nếu carbs >85% và item là starch

      const finalScore =
        (0.6 * nutritionFit +
          0.2 * favouriteBoost +
          0.1 * noveltyScore +
          0.1 * diversityScore -
          friedPenalty) *
        overageMultiplier;

      return { score: Math.max(0, finalScore), item };
    });

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return softmaxSample(scored);
}

// ─────────────────────────────────────────────────────────────
// ADAPTIVE TARGET
// ─────────────────────────────────────────────────────────────

/**
 * FIX-1 + OPT-1: tính adaptive target cho một ngày dựa trên
 * nợ dinh dưỡng 3 ngày trước đó (single query, reuse trong tuần).
 *
 * Giới hạn điều chỉnh: ±15% so với target gốc.
 */
async function getAdaptiveTarget(
  userId,
  originalTarget,
  targetDate = new Date(),
) {
  try {
    const { goal } = await getUserNutritionProfile(userId);
    const profile = GOAL_PROFILES[goal] || GOAL_PROFILES.maintain_weight;
    const debtImport = profile.debtImportance || {};

    const referenceDate = toDateOnly(targetDate);
    const threeDaysAgo = new Date(referenceDate);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const yesterday = new Date(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const logs = await MealLog.find({
      userId,
      eatenAt: { $gte: threeDaysAgo, $lte: yesterday },
    }).lean();

    if (!logs.length) return originalTarget;

    // group theo ngày
    const dailyTotals = {};
    logs.forEach((log) => {
      const day = new Date(log.eatenAt).toISOString().slice(0, 10);

      if (!dailyTotals[day]) {
        dailyTotals[day] = {};
        Object.keys(originalTarget).forEach((k) => (dailyTotals[day][k] = 0));
      }

      const nutri = log.recipe?.nutrition || {};
      const scale = log.recipe?.scale || 1.0;
      for (const k in originalTarget) {
        if (typeof nutri[k] === "number") {
          dailyTotals[day][k] += nutri[k] * scale;
        }
      }
    });

    // tính debt
    const totalDebt = {};
    Object.keys(originalTarget).forEach((k) => (totalDebt[k] = 0));

    Object.values(dailyTotals).forEach((actual) => {
      for (const k in originalTarget) {
        totalDebt[k] += (originalTarget[k] || 0) - (actual[k] || 0);
      }
    });

    const daysCount = Object.keys(dailyTotals).length || 1;

    const adaptiveTarget = { ...originalTarget };

    for (const k in originalTarget) {
      const avgDebt = totalDebt[k] / daysCount;
      const importance = debtImport[k] || 1.0;
      const maxAdj = originalTarget[k] * 0.15;

      const finalAdj = Math.max(
        -maxAdj,
        Math.min(maxAdj, avgDebt * importance),
      );

      adaptiveTarget[k] = parseFloat((originalTarget[k] + finalAdj).toFixed(1));
    }

    return adaptiveTarget;
  } catch (err) {
    console.error("[getAdaptiveTarget] error:", err);
    return originalTarget;
  }
}

/**
 * OPT-1: Tính adaptive targets cho nhiều ngày trong 1 DB query.
 * Dùng bởi recommendWeekPlan để tránh N query.
 *
 * @param {string}   userId
 * @param {Object}   originalTarget
 * @param {Date[]}   dates           - mảng ngày cần tính
 * @returns {Promise<Map<string, Object>>}  dateStr → adaptiveTarget
 */
async function getAllAdaptiveTargets(userId, originalTarget, dates) {
  const sorted = dates.map((d) => toDateOnly(d)).sort((a, b) => a - b);

  const queryFrom = new Date(sorted[0]);
  queryFrom.setDate(queryFrom.getDate() - 3);

  const queryTo = new Date(sorted[sorted.length - 1]);
  queryTo.setDate(queryTo.getDate() - 1);

  const logs = await MealLog.find({
    userId,
    eatenAt: { $gte: queryFrom, $lte: queryTo },
  }).lean();

  // group theo ngày
  const dailyTotals = new Map();

  logs.forEach((log) => {
    const day = new Date(log.eatenAt).toISOString().slice(0, 10);

    if (!dailyTotals.has(day)) {
      const init = {};
      Object.keys(originalTarget).forEach((k) => (init[k] = 0));
      dailyTotals.set(day, init);
    }

    const nutri = log.recipe?.nutrition || {};
    const scale = log.recipe?.scale || 1.0;
    const current = dailyTotals.get(day);

    for (const k in originalTarget) {
      if (typeof nutri[k] === "number") {
        current[k] += nutri[k] * scale;
      }
    }
  });

  const { goal } = await getUserNutritionProfile(userId);
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES.maintain_weight;
  const debtImport = profile.debtImportance || {};

  const result = new Map();

  for (const date of dates) {
    const ref = toDateOnly(date);
    const dayTarget = { ...originalTarget };

    const windowDays = [];

    for (let i = 1; i <= 3; i++) {
      const d = new Date(ref);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);

      if (dailyTotals.has(key)) {
        windowDays.push(dailyTotals.get(key));
      }
    }

    if (windowDays.length) {
      const totalDebt = {};
      Object.keys(originalTarget).forEach((k) => (totalDebt[k] = 0));

      windowDays.forEach((actual) => {
        for (const k in originalTarget) {
          totalDebt[k] += (originalTarget[k] || 0) - (actual[k] || 0);
        }
      });

      const daysCount = windowDays.length;

      for (const k in originalTarget) {
        const avgDebt = totalDebt[k] / daysCount;

        const maxAdj = originalTarget[k] * 0.15;

        const finalAdj = Math.max(
          -maxAdj,
          Math.min(maxAdj, avgDebt * (debtImport[k] || 1.0)),
        );

        dayTarget[k] = parseFloat((originalTarget[k] + finalAdj).toFixed(1));
      }
    }

    result.set(ref.toISOString(), dayTarget);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// BUILD MEAL
// ─────────────────────────────────────────────────────────────

/**
 * Xây dựng 1 bữa ăn hoàn chỉnh.
 *
 * FIX-2: Tính accumulatedCarbs sau mỗi lần push và truyền vào context
 *        để adaptiveCarbsPenalty trong pickOne hoạt động đúng.
 *
 * @param {Map}    poolCache  - OPT-4 category → items[]
 * @param {string} mealType
 * @param {Object} adjTarget  - target ĐÃ được điều chỉnh rolling-debt
 * @param {Object} context    - shared mutable state
 */
function buildMeal(poolCache, mealType, adjTarget, context) {
  const chosen = [];

  // Helper: scale đồng bộ TẤT CẢ macro theo tỷ lệ — FIX 1
  function scaledTarget(ratio) {
    return {
      calories: adjTarget.calories * ratio,
      protein: adjTarget.protein * ratio,
      fat: adjTarget.fat * ratio,
      carbs: adjTarget.carbs * ratio,
    };
  }

  function pick(categories, target) {
    const accumulated = sumNutrition(chosen);
    const accumulatedRatio = {
      calories:
        adjTarget.calories > 0 ? accumulated.calories / adjTarget.calories : 0,
      protein:
        adjTarget.protein > 0 ? accumulated.protein / adjTarget.protein : 0,
      fat: adjTarget.fat > 0 ? accumulated.fat / adjTarget.fat : 0,
      carbs: adjTarget.carbs > 0 ? accumulated.carbs / adjTarget.carbs : 0,
    };
    return pickOne(poolCache, categories, target, {
      ...context,
      mealType,
      accumulatedNutrition: accumulated,
      accumulatedRatio,
      mealTarget: adjTarget,
    });
  }

  function push(item) {
    if (item) chosen.push(item);
  }

  function remainRatio() {
    const used = sumNutrition(chosen).calories;
    return Math.max(0, (adjTarget.calories - used) / adjTarget.calories);
  }

  // ─── BREAKFAST ───────────────────────────────────────────────
  if (mealType === "breakfast") {
    // FIX 2: nhắm 70% thay vì 100% để tránh overshoot
    const oneDish = pick(["one_dish_meal"], scaledTarget(0.7));
    push(oneDish);

    if (remainRatio() > 0.15)
      push(pick(["light_supplement"], scaledTarget(remainRatio() * 0.6)));

    if (remainRatio() > 0.05)
      push(pick(["drink", "dessert", "fruit"], scaledTarget(remainRatio())));

    // Fallback nếu không có one_dish_meal
    if (!oneDish) {
      push(pick(["main"], scaledTarget(0.45)));
      push(pick(["base_starch"], scaledTarget(0.35)));
      push(pick(["soup_veg"], scaledTarget(0.2)));

      if (remainRatio() > 0.15)
        push(pick(["light_supplement"], scaledTarget(remainRatio() * 0.5)));
      if (remainRatio() > 0.1)
        push(pick(["dessert", "drink", "fruit"], scaledTarget(remainRatio())));
    }

    // ─── LUNCH / DINNER ──────────────────────────────────────────
  } else if (mealType === "lunch" || mealType === "dinner") {
    if (Math.random() < 0.6) {
      // Combo: main + starch + soup/veg → tổng = 100%, macro đồng bộ — FIX 1
      push(pick(["main"], scaledTarget(0.45)));
      push(pick(["base_starch"], scaledTarget(0.35)));
      push(pick(["soup_veg"], scaledTarget(0.2)));

      if (remainRatio() > 0.15)
        push(pick(["side"], scaledTarget(remainRatio() * 0.6)));
      if (remainRatio() > 0.1)
        push(
          pick(["dessert", "light_supplement"], scaledTarget(remainRatio())),
        );
    } else {
      // One-dish: nhắm 75%, phần còn lại dành cho side/fruit
      push(pick(["one_dish_meal"], scaledTarget(0.75)));

      if (remainRatio() > 0.15)
        push(pick(["side"], scaledTarget(remainRatio() * 0.6)));
      if (remainRatio() > 0.1)
        push(pick(["fruit", "light_supplement"], scaledTarget(remainRatio())));
    }

    // ─── SNACK ───────────────────────────────────────────────────
  } else if (mealType === "snack") {
    // Ưu tiên fruit/light_supplement trước (nhẹ hơn dessert)
    // Nhắm 60% để còn chỗ cho món thứ 2 nếu vẫn còn thiếu
    const snackMain = pick(
      ["fruit", "light_supplement", "dessert"],
      scaledTarget(0.7),
    );
    push(snackMain);

    // Fallback: nếu category trên không có món nào → thử rộng hơn
    if (!snackMain) {
      push(pick(["dessert", "drink"], scaledTarget(0.7)));
    }

    // Nếu vẫn còn dư >20% thì thêm 1 món nhỏ nữa
    if (remainRatio() > 0.2)
      push(pick(["dessert", "drink", "fruit"], scaledTarget(remainRatio())));
  }

  // ─── CLEANUP: nếu vẫn vượt >15% thì pop từ cuối ─────────────
  while (
    chosen.length > 1 &&
    sumNutrition(chosen).calories > adjTarget.calories * 1.15
  ) {
    chosen.pop();
  }

  // ─── Cập nhật shared context ──────────────────────────────────
  chosen.forEach((r) => {
    context.usedNames.add(r.name);
    const src = detectMealSource(r);
    context.usedMealSources.set(
      src,
      (context.usedMealSources.get(src) || 0) + 1,
    );
    context.usedCategories.set(
      r.category,
      (context.usedCategories.get(r.category) || 0) + 1,
    );
  });

  // ─── Build output ─────────────────────────────────────────────
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
  for (const k in totalNutrition)
    totalNutrition[k] = parseFloat(totalNutrition[k].toFixed(1));

  return {
    mealType,
    items: itemsWithScaled.map(({ r, scaled, scale }) => ({
      recipeId: r._id,
      name: r.name,
      imageUrl: r.imageUrl,
      description: r.description,
      scale: parseFloat(scale.toFixed(3)),
      mealSource: detectMealSource(r),
      nutrition: {
        calories: parseFloat(r.totalNutritionPerServing.calories.toFixed(1)),
        protein: parseFloat(r.totalNutritionPerServing.protein.toFixed(1)),
        fat: parseFloat(r.totalNutritionPerServing.fat.toFixed(1)),
        carbs: parseFloat(r.totalNutritionPerServing.carbs.toFixed(1)),
      },
      servingTime: mealType,
      isChecked: false,
    })),
    totalNutrition,
  };
}

// ─────────────────────────────────────────────────────────────
// BUILD DAY PLAN
// ─────────────────────────────────────────────────────────────

/**
 * Tạo thực đơn 1 ngày.
 *
 * FIX-1: Rolling-debt bên trong chỉ cân bằng GIỮA CÁC BỮA (≤10%),
 *        không dùng debtImportance để tránh khuếch đại lên macro tổng.
 *        Điều chỉnh dài hạn đã được xử lý bởi getAdaptiveTarget.
 *
 * @param {Map}    poolCache     - OPT-4
 * @param {Object} dailyTarget   - ĐÃ adaptive (từ getAdaptiveTarget)
 * @param {string} goal
 * @param {Object} sharedContext
 */
function buildDayPlan(poolCache, dailyTarget, goal, sharedContext) {
  console.log(">>> Adaptive target lại là:", dailyTarget);
  const debt = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const dayMeals = [];

  for (const mealKey of ["breakfast", "lunch", "dinner"]) {
    const baseTarget = {};
    for (const k in dailyTarget)
      baseTarget[k] = dailyTarget[k] * MEAL_SPLIT[mealKey];

    // FIX-1: intra-day rolling debt — giới hạn ±10%, không dùng debtImportance
    const adjTarget = {};
    for (const k in baseTarget) {
      const maxAdj = baseTarget[k] * 0.1;
      const adjVal = Math.max(-maxAdj, Math.min(maxAdj, (debt[k] || 0) / 2));
      adjTarget[k] = Math.max(0, baseTarget[k] + adjVal);
    }

    const meal = buildMeal(poolCache, mealKey, adjTarget, {
      ...sharedContext,
      goal,
      mealType: mealKey,
    });
    dayMeals.push(meal);

    for (const k in debt)
      debt[k] = (debt[k] || 0) + baseTarget[k] - meal.totalNutrition[k];
  }

  const dailyTotal = dayMeals.reduce(
    (acc, m) => {
      acc.calories += m.totalNutrition.calories;
      acc.protein += m.totalNutrition.protein;
      acc.fat += m.totalNutrition.fat;
      acc.carbs += m.totalNutrition.carbs;
      //TODO: sau nàu thêm fiber, sugar, sodium
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
  for (const k in dailyTotal)
    dailyTotal[k] = parseFloat(dailyTotal[k].toFixed(1));

  // Snack fallback: nếu 3 bữa vẫn thiếu >10% bất kỳ macro → thêm 1 bữa snack
  const debts = {
    calories: dailyTotal.calories < dailyTarget.calories * 0.9,
    protein: dailyTotal.protein < dailyTarget.protein * 0.85,
  };
  const snackTarget = {
    calories: dailyTarget.calories - dailyTotal.calories,
    protein: dailyTarget.protein - dailyTotal.protein,
    fat: dailyTarget.fat - dailyTotal.fat,
    carbs: dailyTarget.carbs - dailyTotal.carbs,
  };
    console.log("tim snack: ", "protein debt:", debts.protein, "calorie debt:", debts.calories);

  if (debts.calories || debts.protein) {
    let snack = buildMeal(poolCache, "snack", snackTarget, {
      ...sharedContext,
      goal,
      mealType: "snack",
    });

    const nutri = {
      calories: dailyTotal.calories + snack.totalNutrition.calories,
      protein: dailyTotal.protein + snack.totalNutrition.protein,
      fat: dailyTotal.fat + snack.totalNutrition.fat,
      carbs: dailyTotal.carbs + snack.totalNutrition.carbs,
    };
    let count = 0;

    while (
      (Math.abs(nutri.calories - dailyTarget.calories) >=
        dailyTarget.calories * 0.1 ||
        Math.abs(nutri.protein - dailyTarget.protein) >=
          dailyTarget.protein * 0.15 ||
        Math.abs(nutri.fat - dailyTarget.fat) >= dailyTarget.fat * 0.15 ||
        Math.abs(nutri.carbs - dailyTarget.carbs) >=
          dailyTarget.carbs * 0.15) &&
      count < 5
    ) {
      console.log("vao tim snack lan:", count + 1);

      snack = buildMeal(poolCache, "snack", snackTarget, {
        ...sharedContext,
        goal,
        mealType: "snack",
      });
      console.log("vao snack lan:", count + 1, "nutri:", snack.totalNutrition);
      count++;
    }

    if (snack && snack.items.length > 0 && count < 5) {
      // Update dailyTotal với snack
      dailyTotal.calories += snack.totalNutrition.calories;
      dailyTotal.protein += snack.totalNutrition.protein;
      dailyTotal.fat += snack.totalNutrition.fat;
      dailyTotal.carbs += snack.totalNutrition.carbs;

      for (const k in dailyTotal)
        dailyTotal[k] = parseFloat(dailyTotal[k].toFixed(1));
    }
  }

  return { meals: dayMeals, dailyTotal };
}

// ─────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────

async function getUserNutritionProfile(userId) {
  try {
    const ng = await NutritionGoal.findOne({ userId, status: "active" }).lean();
    if (ng) {
      return {
        tdee: ng.tdee?.calories || 2000,
        goal: ng.bodySnapshot?.goal || DEFAULT_GOAL,
        target: ng.targetNutrition,
      };
    }
    return NUTRITION_DEFAULTS;
  } catch (err) {
    console.error(`[getUserNutritionProfile] userId=${userId}:`, err.message);
    return NUTRITION_DEFAULTS;
  }
}

async function getFavouriteIds(userId) {
  const user = await User.findById(userId).select("favoriteRecipes").lean();
  if (!user?.favoriteRecipes?.length) return new Set();
  return new Set(user.favoriteRecipes.map(String));
}

function normalizeRecipes(rawRecipes, allergies = []) {
  const allergyLower = allergies.map((a) => a.toLowerCase());
  // console.log("rawRecipe:", rawRecipes[0])
  return rawRecipes.reduce((acc, item) => {
    // 1. PHẦN FILTER: Kiểm tra điều kiện ngay tại đây
    const calories = parseFloat(item.totalNutritionPerServing?.calories || 0);
    // Nếu calories không hợp lệ -> return acc luôn (bỏ qua phần tử này)
    if (calories <= 0) return acc;

    // Kiểm tra dị ứng
    if (allergyLower.length) {
      const txt = (
        item.name +
        " " +
        (item.ingredients || [])
          .map((i) => i.name || i.rawName || "")
          .join(" ") +
        (item.allergy_tags || []).join(" ")
      ).toLowerCase();

      // Nếu chứa dị ứng -> return acc luôn
      if (allergyLower.some((a) => txt.includes(a))) return acc;
    }

    // 2. PHẦN MAP: Xây dựng object mới khi đã vượt qua bộ lọc
    const newItem = {
      ...item,
    };
    // 3. Thêm vào mảng kết quả
    acc.push(newItem);
    return acc;
  }, []); // Khởi tạo mảng rỗng làm giá trị bắt đầu
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Gợi ý thực đơn 1 ngày.
 *
 * @param {string|ObjectId} userId
 * @param {Object}  options
 * @param {Date}    options.date      (default: hôm nay)
 */
async function recommendDayPlan(userId, options = {}) {
  const { date = new Date() } = options;

  // 1. Profile + adaptive target (getAdaptiveTarget = điều chỉnh lịch sử DB)
  const {
    tdee,
    goal,
    target: dailyTarget,
  } = await getUserNutritionProfile(userId);
  const adaptiveTarget = await getAdaptiveTarget(userId, dailyTarget, date);

  // 2. Load data song song
  const [rawRecipes, recentNames, favouriteIds, user] = await Promise.all([
    Recipe.aggregate([
      {
        $match: {
          deleted: { $ne: true },
          verified: true,
          "totalNutritionPerServing.calories": { $gt: 0 },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          totalWeight: 1,
          category: 1,
          description: 1,
          allergy_tags: 1,
          ingredients: 1,
          servings: 1,
          totalNutritionPerServing: 1,
          imageUrl: 1,
          nutritionVector: 1,
        },
      },
    ]),
    mealLogService.getRecentlyEatenMap(userId),
    getFavouriteIds(userId),
    User.findById(userId).select("allergies").lean(),
  ]);

  // 3. Normalize + OPT-4 cache
  const recipes = normalizeRecipes(rawRecipes, user?.allergies || []);
  const poolCache = buildPoolCache(recipes);

  // 4. Context ngày
  const dayContext = {
    usedNames: new Set(),
    usedMealSources: new Map(),
    usedCategories: new Map(),
    favouriteIds,
    recentEatenMap: recentNames,
  };

  // 5. Build plan — FIX-1: truyền adaptiveTarget (bù lịch sử DB đã xong)
  //    buildDayPlan chỉ còn lo rolling-debt nội ngày
  const { meals, dailyTotal } = buildDayPlan(
    poolCache,
    adaptiveTarget,
    goal,
    dayContext,
  );
  const mealToRecipe = meals.flatMap((meal) => {
    // Map qua các items bên trong meal
    return meal.items;
  });
  // 6. Optionally save
  let dailyMenuId = null;
    const logDate = toDateOnly(date);
    const logDoc = await DailyMenu.findOneAndUpdate(
      { userId, date: logDate },
      {
        userId,
        date: logDate,
        recipes: mealToRecipe,
        totalNutrition: dailyTotal,
        targetNutrition: adaptiveTarget,
        status: "suggested",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    dailyMenuId = logDoc._id;

  return {
    date: toDateOnly(date),
    recipes: mealToRecipe,
    totalNutrition: { ...dailyTotal },
    targetNutrition: { ...adaptiveTarget },
    status: "suggested",
    ...(dailyMenuId && { _id: dailyMenuId }),
  };
}

/**
 * Gợi ý thực đơn 7 ngày.
 *
 * FIX-3 + OPT-1: Gọi getAllAdaptiveTargets 1 lần cho cả tuần.
 *
 * @param {string|ObjectId} userId
 * @param {Object}  options
 * @param {boolean} options.saveToDB   (default: false)
 * @param {Date}    options.startDate  (default: hôm nay)
 * @param {number}  options.days       (default: 7, max: 14)
 */
async function recommendWeekPlan(userId, options = {}) {
  const { saveToDB = false, startDate = new Date(), days = 7 } = options;
  const numDays = Math.min(Math.max(days, 1), 14);

  // 1. Profile
  const {
    tdee,
    goal,
    target: dailyTarget,
  } = await getUserNutritionProfile(userId);

  // 2. Load data + tính adaptive targets cho cả tuần 1 lần
  const dates = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const [rawRecipes, recentNames, favouriteIds, user, adaptiveTargetsMap] =
    await Promise.all([
      Recipe.find({ deleted: { $ne: true } }).lean(),
      mealLogService.getRecentlyEatenMap(userId),
      getFavouriteIds(userId),
      User.findById(userId).select("allergies").lean(),
      getAllAdaptiveTargets(userId, dailyTarget, dates),
    ]);

  const recipes = normalizeRecipes(rawRecipes, user?.allergies || []);
  const poolCache = buildPoolCache(recipes);

  // 3. Weekly shared context
  const weekContext = {
    usedNames: new Set(),
    favouriteIds,
    recentEatenMap: recentNames,
  };

  const weekPlan = [];

  // 4. Build từng ngày — thu thập kết quả trước, saveToDB sau
  for (let i = 0; i < numDays; i++) {
    const dayDate = dates[i];
    const adaptiveTarget =
      adaptiveTargetsMap.get(toDateOnly(dayDate).toISOString()) || dailyTarget;

    const dayContext = {
      usedNames: weekContext.usedNames,     // shared cả tuần → tránh lặp món
      usedMealSources: new Map(),           // reset mỗi ngày
      usedCategories: new Map(),            // reset mỗi ngày
      favouriteIds,
      recentEatenMap: weekContext.recentEatenMap,
    };

    const { meals, dailyTotal } = buildDayPlan(
      poolCache,
      adaptiveTarget,
      goal,
      dayContext,
    );

    // Flatten meals -> recipes flat array (align với DailyMenu schema)
    const recipesPlanned = meals.flatMap((meal) => meal.items);

    weekPlan.push({
      dayIndex: i + 1,
      date: toDateOnly(dayDate),
      recipes: recipesPlanned,
      totalNutrition: dailyTotal,
      targetNutrition: adaptiveTarget,
      _adaptiveTarget: adaptiveTarget,
    });
  }

  // 5. saveToDB: tạo tất cả DailyMenu song song, rồi mới tạo MealPlan
  if (saveToDB) {
    const dailyMenuDocs = await Promise.all(
      weekPlan.map((day) => {
        const dateStr = day.date.toISOString().split("T")[0]; // "YYYY-MM-DD"
        return DailyMenu.findOneAndUpdate(
          { userId, date: dateStr },
          {
            userId,
            date: dateStr,
            recipes: day.recipes,
            totalNutrition: day.totalNutrition,
            targetNutrition: day._adaptiveTarget,
            status: "suggested",
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      }),
    );

    const dailyMenuIds = dailyMenuDocs.map((dm) => dm._id);
    const startDateStr = toDateOnly(dates[0]).toISOString().split("T")[0];
    const endDateStr = toDateOnly(dates[numDays - 1]).toISOString().split("T")[0];

    await MealPlan.create({
      userId,
      startDate: startDateStr,
      endDate: endDateStr,
      dailyMenuIds,
      source: "ai",
      generatedBy: "nutrition_ai_v2",
      status: "suggested",
    });
  }

  // 6. Cleanup internal fields trước khi return
  weekPlan.forEach((day) => {
    delete day._adaptiveTarget;
  });

  // 7. Tổng hợp weekly stats
  const weeklyTotal = weekPlan.reduce(
    (acc, day) => {
      acc.calories += day.totalNutrition.calories;
      acc.protein += day.totalNutrition.protein;
      acc.fat += day.totalNutrition.fat;
      acc.carbs += day.totalNutrition.carbs;
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
    dailyTarget,
    dailyMenu:weekPlan,
    weeklyTotal,
    weeklyAverage: {
      calories: parseFloat((weeklyTotal.calories / numDays).toFixed(1)),
      protein: parseFloat((weeklyTotal.protein / numDays).toFixed(1)),
      fat: parseFloat((weeklyTotal.fat / numDays).toFixed(1)),
      carbs: parseFloat((weeklyTotal.carbs / numDays).toFixed(1)),
    },
  };
}

module.exports = { recommendDayPlan, recommendWeekPlan };