"use strict";
const mongoose = require("mongoose");
const Recipe        = require("../models/Recipe");
const DailyMenu      = require("../models/DailyMenu");
const NutritionGoal = require("../models/NutritionGoal");
const User          = require("../models/User");
const { getRecentlyEatenMap } = require("./mealLog.service");
// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MEAL_SPLIT = {
  breakfast: 0.25,
  lunch    : 0.40,
  dinner   : 0.35,
};

/**
 * cal_f            : hệ số nhân TDEE
 * p/f/c            : tỷ lệ macro
 * friedPenaltyBase : phạt món chiên rán
 * debtImportance   : trọng số khi bù đắp nợ lịch sử (getAdaptiveTarget)
 */
const GOAL_PROFILES = {
  lose_weight: {
    cal_f           : 0.80,
    p               : 0.35, f: 0.25, c: 0.40,
    friedPenaltyBase: 0.50,
    debtImportance  : { calories: 1.2, protein: 1.5, fat: 1.0, carbs: 0.7 },
  },
  maintain_weight: {
    cal_f           : 1.00,
    p               : 0.20, f: 0.30, c: 0.50,
    friedPenaltyBase: 0.25,
    debtImportance  : { calories: 1.0, protein: 1.0, fat: 1.0, carbs: 1.0 },
  },
  gain_weight: {
    cal_f           : 1.15,
    p               : 0.25, f: 0.25, c: 0.50,
    friedPenaltyBase: 0.10,
    debtImportance  : { calories: 1.0, protein: 1.8, fat: 0.8, carbs: 1.2 },
  },
};

const DEFAULT_GOAL = "maintain_weight";

const NUTRITION_WEIGHTS = { calories: 2.0, protein: 2.0, fat: 1.8, carbs: 1.5 };

const MAX_CALO_PER_CAT = {
  main            : 550,
  base_starch     : 350,
  side_dish       : 200,
  soup_veg        : 200,
  one_dish_meal   : 600,
  dessert         : 120,
  light_supplement: 250,
};

const HISTORY_LOOKBACK_DAYS = 7;

/** Softmax temperature — cao → đều hơn, thấp → winner-takes-all */
const SOFTMAX_TEMP = 6.0;

const PROTEIN_SOURCE_KEYWORDS = {
  chicken : ["gà", "chicken", "ức gà", "đùi gà"],
  pork    : ["heo", "lợn", "pork", "sườn", "ba chỉ"],
  beef    : ["bò", "beef", "thịt bò"],
  seafood : ["cá", "tôm", "mực", "cua", "hải sản", "fish", "shrimp"],
  egg     : ["trứng", "egg"],
  tofu    : ["đậu phụ", "tofu", "đậu hũ"],
  pho     : ["phở", "pho"],
  bun     : ["bún", "bun"],
  mi      : ["mì"],
};

const NUTRITION_DEFAULTS = {
  tdee  : 2000,
  goal  : DEFAULT_GOAL,
  target: {
    calories: 2000, protein: 150, fat: 67,
    carbs: 200, fiber: 25, sugar: 50, sodium: 2300,
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
  const rawCal    = item.nutri?.calories || 0;
  const threshold = MAX_CALO_PER_CAT[item.category];
  if (!threshold || rawCal <= 0) return 1.0;
  return rawCal > threshold ? threshold / rawCal : 1.0;
}

function getScaledNutri(item, scaleOverride = null) {
  const n     = item.nutri || {};
  const scale = scaleOverride !== null ? scaleOverride : getNormalizedScale(item);
  return {
    scaled: {
      calories: (n.calories || 0) * scale,
      protein : (n.protein  || 0) * scale,
      fat     : (n.fat      || 0) * scale,
      carbs   : (n.carbs    || 0) * scale,
    },
    scale,
  };
}

/** Gaussian fitness: càng gần target → càng cao (0→1) */
function gaussianScore(itemNutri, targetVec) {
  let sse = 0.0, totalW = 0.0;
  for (const [key, w] of Object.entries(NUTRITION_WEIGHTS)) {
    const t    = targetVec[key] || 1;
    const a    = itemNutri[key] || 0;
    let   diff = (a - t) / t;

    // Asymmetric penalties
    if (key === "protein") {
      // Nếu thừa Protein quá 20%, bắt đầu phạt nặng dần
      if (diff > 0.2) diff *= 4.0; 
      // Nếu thiếu Protein, vẫn phạt cực nặng để đảm bảo cơ bắp
      else if (diff < 0) diff *= 5.0;
    } 
    else if (key === "carbs") {
      // Nếu thiếu Carbs, phải phạt nặng để hệ thống đi tìm cơm/sắn/ngô
      if (diff < 0) diff *= 3.0;
      // Nếu thừa Carbs, phạt để tránh béo
      else if (diff > 0) diff *= 2.0;
    }
    sse    += w * diff * diff;
    totalW += w;
  }
  return Math.exp((-0.5 * sse) / totalW);
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

  const top  = scoredItems.slice(0, Math.min(scoredItems.length, 8));
  const exps = top.map((x) => Math.exp(x.score * temp));
  const sum  = exps.reduce((a, b) => a + b, 0);

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
      acc.protein  += scaled.protein;
      acc.fat      += scaled.fat;
      acc.carbs    += scaled.carbs;
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
 * Chọn 1 món từ pool theo scoring đa tiêu chí.
 *
 * finalScore = 0.50 * nutritionFit
 *            + 0.20 * favouriteBoost
 *            + 0.15 * noveltyScore
 *            + 0.15 * diversityScore
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
    usedNames       = new Set(),
    usedMealSources = new Map(),
    usedCategories  = new Map(),
    favouriteIds    = new Set(),
    goal            = DEFAULT_GOAL,
    mealType        = "lunch",
    recentEatenMap  = new Map(),
    // FIX-2: hai field này giờ được truyền đúng từ buildMeal
    accumulatedCarbs  = 0,
    dailyTargetCarbs  = Infinity,
  } = context;

  const allowedCats = Array.isArray(categories) ? categories : [categories];
  const profile     = GOAL_PROFILES[goal] || GOAL_PROFILES[DEFAULT_GOAL];

  // OPT-4: lấy sub-pool từ cache, O(k) thay vì O(n)
  const subPool = allowedCats.flatMap((c) => poolCache.get(c) || []);
  if (!subPool.length) return null;

  const currentCarbsRatio = dailyTargetCarbs > 0
    ? accumulatedCarbs / dailyTargetCarbs
    : 0;

  const scored = subPool
    // OPT-5: loại hard exclusion trước khi score
    .filter((item) => !usedNames.has(item.name))
    .map((item) => {
      const { scaled }     = getScaledNutri(item);
      const proteinSrc     = detectMealSource(item);

      // 1. Nutrition fitness
      const nutritionFit   = gaussianScore(scaled, targetVec);

      // 2. Favourite boost
      const favouriteBoost = favouriteIds.has(String(item._id)) ? 1.0 : 0.0;

      // 3. Novelty — OPT-3: sigmoid thay linear
      let noveltyScore = 1.0;
      if (recentEatenMap.has(item.name)) {
        const daysAgo = recentEatenMap.get(item.name);
        noveltyScore  = noveltyFromDays(daysAgo);
      }

      // 4. Diversity: protein source
      const proteinCount    = usedMealSources.get(proteinSrc) || 0;
      const proteinDiversity = Math.max(0, 1.0 - proteinCount * 0.35);

      // 5. Diversity: category
      const catCount        = usedCategories.get(item.category) || 0;
      const catDiversity    = Math.max(0, 1.0 - catCount * 0.25);

      const diversityScore  = (proteinDiversity + catDiversity) / 2;

      // 6. Goal-based penalty (chiên rán)
      const friedPenalty    = item.is_fried
        ? profile.friedPenaltyBase * (mealType === "dinner" ? 1.5 : 1.0)
        : 0.0;

      // 7. FIX-2: adaptive carbs penalty — giờ currentCarbsRatio có giá trị thực
      const adaptiveCarbsPenalty =
        currentCarbsRatio > 0.7 && item.category === "base_starch" ? 0.4 : 0;

      const finalScore =
        0.50 * nutritionFit  +
        0.20 * favouriteBoost +
        0.15 * noveltyScore  +
        0.15 * diversityScore -
        friedPenalty         -
        adaptiveCarbsPenalty;

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
async function getAdaptiveTarget(userId, originalTarget, targetDate = new Date()) {
  try {
    const { goal }   = await getUserNutritionProfile(userId);
    const profile    = GOAL_PROFILES[goal] || GOAL_PROFILES.maintain_weight;
    const debtImport = profile.debtImportance || {};

    const referenceDate = toDateOnly(targetDate);
    const threeDaysAgo  = new Date(referenceDate);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const yesterday = new Date(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const logs = await MealLog.find({
      userId,
      eatenAt: { 
        $gte: threeDaysAgoStart, 
        $lt: targetDayStart // Lấy dữ liệu của 3 ngày TRƯỚC ngày target
      },
    }).lean();

    if (!logs?.length) return originalTarget;

    // Tổng nợ (target - actual) trong 3 ngày
    const totalDebt = {};
    Object.keys(originalTarget).forEach((k) => (totalDebt[k] = 0));
    logs.forEach((log) => {
      const actual = log.dailyTotalNutrition || {};
      for (const k in originalTarget) {
        if (typeof actual[k] === "number" && typeof originalTarget[k] === "number") {
          totalDebt[k] += originalTarget[k] - actual[k];
        }
      }
    });

    const adaptiveTarget = { ...originalTarget };
    for (const k in originalTarget) {
      if (typeof originalTarget[k] !== "number") continue;
      const avgDebt      = totalDebt[k] / 3;
      const importance   = debtImport[k] || 1.0;
      const maxAdj       = originalTarget[k] * 0.15;
      const finalAdj     = Math.max(-maxAdj, Math.min(maxAdj, avgDebt * importance));
      adaptiveTarget[k]  = parseFloat((originalTarget[k] + finalAdj).toFixed(1));
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
  // Lấy khoảng cần truy vấn (sớm nhất - 3 ngày đến muộn nhất - 1 ngày)
  const sorted    = dates.map((d) => toDateOnly(d)).sort((a, b) => a - b);
  const queryFrom = new Date(sorted[0]);
  queryFrom.setDate(queryFrom.getDate() - 3);
  const queryTo   = new Date(sorted[sorted.length - 1]);
  queryTo.setDate(queryTo.getDate() - 1);

  const logs = await MealLog.find({
      userId,
      eatenAt: { 
        $gte: queryFrom, 
        $lt: queryTo 
      },
    }).lean();

  // Group logs theo ngày
  const logsByDate = new Map();
  logs.forEach((log) => {
    const key = toDateOnly(log.date).toISOString();
    if (!logsByDate.has(key)) logsByDate.set(key, []);
    logsByDate.get(key).push(log);
  });

  const { goal }   = await getUserNutritionProfile(userId);
  const profile    = GOAL_PROFILES[goal] || GOAL_PROFILES.maintain_weight;
  const debtImport = profile.debtImportance || {};

  const result = new Map();

  for (const date of dates) {
    const ref       = toDateOnly(date);
    const dayTarget = { ...originalTarget };

    // Lấy 3 ngày liền trước
    const windowLogs = [];
    for (let i = 1; i <= 3; i++) {
      const d   = new Date(ref);
      d.setDate(d.getDate() - i);
      const key = d.toISOString();
      if (logsByDate.has(key)) windowLogs.push(...logsByDate.get(key));
    }

    if (windowLogs.length) {
      const totalDebt = {};
      Object.keys(originalTarget).forEach((k) => (totalDebt[k] = 0));
      windowLogs.forEach((log) => {
        const actual = log.dailyTotalNutrition || {};
        for (const k in originalTarget) {
          if (typeof actual[k] === "number" && typeof originalTarget[k] === "number") {
            totalDebt[k] += originalTarget[k] - actual[k];
          }
        }
      });

      for (const k in originalTarget) {
        if (typeof originalTarget[k] !== "number") continue;
        const avgDebt  = totalDebt[k] / 3;
        const maxAdj   = originalTarget[k] * 0.15;
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

  /**
   * Helper nội bộ: pickOne + tự cập nhật accumulatedCarbs trước khi gọi.
   * FIX-2: đảm bảo adaptiveCarbsPenalty luôn nhận giá trị thực tế.
   */
  function pick(categories, target) {
    const accumulated      = sumNutrition(chosen);
    const enrichedContext  = {
      ...context,
      mealType,
      accumulatedCarbs : accumulated.carbs,
      dailyTargetCarbs : adjTarget.carbs,
    };
    return pickOne(poolCache, categories, target, enrichedContext);
  }

  function push(item) {
    if (item) chosen.push(item);
  }

  function remainRatio() {
    return (adjTarget.calories - sumNutrition(chosen).calories) / adjTarget.calories;
  }

  if (mealType === "breakfast") {
    const oneDish = pick(["one_dish_meal"], adjTarget);
    push(oneDish);

    if (remainRatio() > 0.20)
      push(pick(["light_supplement"], { calories: adjTarget.calories * 0.20 }));

    if (remainRatio() > 0.15)
      push(pick(["drink", "dessert", "fruit"], { calories: adjTarget.calories * 0.15 }));

    // Fallback nếu không có one_dish_meal
    if (!oneDish) {
      push(pick(["main"],       { ...adjTarget, calories: adjTarget.calories * 0.45 }));
      push(pick(["base_starch"],{ ...adjTarget, calories: adjTarget.calories * 0.35 }));
      push(pick(["soup_veg"],   { ...adjTarget, calories: adjTarget.calories * 0.20 }));
      if (remainRatio() > 0.15)
        push(pick(["light_supplement"], { calories: adjTarget.calories * remainRatio() * 0.5 }));
      if (remainRatio() > 0.15)
        push(pick(["dessert", "drink", "fruit"], { calories: adjTarget.calories * remainRatio() * 0.5 }));
    }
  } else {
    // Lunch / Dinner: 60% combo, 40% one-dish
    if (Math.random() < 0.6) {
      push(pick(["main"],             { ...adjTarget, calories: adjTarget.calories * 0.45 }));
      push(pick(["base_starch"],      { ...adjTarget, calories: adjTarget.calories * 0.35 }));
      push(pick(["soup_veg", "side"], { ...adjTarget, calories: adjTarget.calories * 0.20 }));
      if (remainRatio() > 0.15)
        push(pick(["side"], { calories: adjTarget.calories * remainRatio() * 0.5 }));
      if (remainRatio() > 0.15)
        push(pick(["dessert", "light_supplement"], { calories: adjTarget.calories * remainRatio() * 0.5 }));
    } else {
      push(pick(["one_dish_meal"], adjTarget));
      if (remainRatio() > 0.40)
        push(pick(["side"], { calories: adjTarget.calories * 0.4 }));
      if (remainRatio() > 0.20)
        push(pick(["fruit", "light_supplement"], { calories: adjTarget.calories * 0.2 }));
    }
  }

  // Cập nhật shared context (mutation in-place)
  chosen.forEach((r) => {
    context.usedNames.add(r.name);
    const src = detectMealSource(r);
    context.usedMealSources.set(src, (context.usedMealSources.get(src) || 0) + 1);
    context.usedCategories.set(r.category, (context.usedCategories.get(r.category) || 0) + 1);
  });

  // Build output với scaled nutrition (source of truth)
  const itemsWithScaled = chosen.map((r) => {
    const { scaled, scale } = getScaledNutri(r);
    return { r, scaled, scale };
  });

  const totalNutrition = itemsWithScaled.reduce(
    (acc, { scaled }) => {
      acc.calories += scaled.calories;
      acc.protein  += scaled.protein;
      acc.fat      += scaled.fat;
      acc.carbs    += scaled.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  for (const k in totalNutrition)
    totalNutrition[k] = parseFloat(totalNutrition[k].toFixed(1));

  return {
    mealType,
    items: itemsWithScaled.map(({ r, scaled, scale }) => ({
      recipeId  : r._id,
      name      : r.name,
      category  : r.category,
      scale     : parseFloat(scale.toFixed(3)),
      mealSource: detectMealSource(r),
      nutrition : {
        calories: parseFloat(scaled.calories.toFixed(1)),
        protein : parseFloat(scaled.protein.toFixed(1)),
        fat     : parseFloat(scaled.fat.toFixed(1)),
        carbs   : parseFloat(scaled.carbs.toFixed(1)),
      },
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
  console.log("adtive target for the day:", dailyTarget);
  const debt    = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const dayMeals = [];

  for (const mealKey of ["breakfast", "lunch", "dinner"]) {
    const baseTarget = {};
    for (const k in dailyTarget)
      baseTarget[k] = dailyTarget[k] * MEAL_SPLIT[mealKey];

    // FIX-1: intra-day rolling debt — giới hạn ±10%, không dùng debtImportance
    const adjTarget = {};
    for (const k in baseTarget) {
      const maxAdj  = baseTarget[k] * 0.10;
      const adjVal  = Math.max(-maxAdj, Math.min(maxAdj, (debt[k] || 0) / 2));
      adjTarget[k]  = Math.max(0, baseTarget[k] + adjVal);
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
      acc.protein  += m.totalNutrition.protein;
      acc.fat      += m.totalNutrition.fat;
      acc.carbs    += m.totalNutrition.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
  for (const k in dailyTotal)
    dailyTotal[k] = parseFloat(dailyTotal[k].toFixed(1));

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
        tdee  : ng.tdee?.calories || 2000,
        goal  : ng.bodySnapshot?.goal || DEFAULT_GOAL,
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
  return rawRecipes
    .map((item) => ({
      ...item,
      nutri: {
        calories: parseFloat(item.totalNutritionPerServing?.calories || 0),
        protein : parseFloat(item.totalNutritionPerServing?.protein  || 0),
        fat     : parseFloat(item.totalNutritionPerServing?.fat      || 0),
        carbs   : parseFloat(item.totalNutritionPerServing?.carbs    || 0),
      },
    }))
    .filter((r) => {
      if (r.nutri.calories <= 0) return false;
      if (allergyLower.length) {
        const txt = (
          r.name + " " +
          (r.ingredients   || []).join(" ") + " " +
          (r.allergy_tags  || []).join(" ")
        ).toLowerCase();
        if (allergyLower.some((a) => txt.includes(a))) return false;
      }
      return true;
    });
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Gợi ý thực đơn 1 ngày.
 *
 * @param {string|ObjectId} userId
 * @param {Object}  options
 * @param {boolean} options.saveToDB  (default: false)
 * @param {Date}    options.date      (default: hôm nay)
 */
async function recommendDayPlan(userId, options = {}) {
  const { saveToDB = false, date = new Date() } = options;

  // 1. Profile + adaptive target (getAdaptiveTarget = điều chỉnh lịch sử DB)
  const { tdee, goal, target: dailyTarget } = await getUserNutritionProfile(userId);
  const adaptiveTarget = await getAdaptiveTarget(userId, dailyTarget, date);

  // 2. Load data song song
  const [rawRecipes, recentNames, favouriteIds, user] = await Promise.all([
    Recipe.find({}).lean(),
    getRecentlyEatenMap(userId),
    getFavouriteIds(userId),
    User.findById(userId).select("allergies").lean(),
  ]);

  // 3. Normalize + OPT-4 cache
  const recipes   = normalizeRecipes(rawRecipes, user?.allergies || []);
  const poolCache = buildPoolCache(recipes);

  // 4. Context ngày
  const dayContext = {
    usedNames      : new Set(),
    usedMealSources: new Map(),
    usedCategories : new Map(),
    favouriteIds,
    recentEatenMap : recentNames,
  };

  // 5. Build plan — FIX-1: truyền adaptiveTarget (bù lịch sử DB đã xong)
  //    buildDayPlan chỉ còn lo rolling-debt nội ngày
  const { meals, dailyTotal } = buildDayPlan(
    poolCache, adaptiveTarget, goal, dayContext,
  );

  // 6. Optionally save
  let dailyMenuId = null;
  if (saveToDB) {
    const logDate = toDateOnly(date);
    const logDoc  = await dailyMenuService.createDailyMenu(
      { userId, date: logDate },
      { userId, date: logDate, meals, dailyTotalNutrition: dailyTotal, dailyTargetNutrition: adaptiveTarget, source: "recommended" },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    dailyMenuId = logDoc._id;
  }

  return {
    date    : toDateOnly(date),
    goal,
    tdee    : parseFloat(tdee.toFixed(0)),
    target  : { ...dailyTarget },
    meals,
    dailyTotal,
    ...(dailyMenuId && { dailyMenuId }),
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
  const { tdee, goal, target: dailyTarget } = await getUserNutritionProfile(userId);

  // 2. Load data + FIX-3/OPT-1: tính adaptive targets cho cả tuần 1 lần
  const dates = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const [rawRecipes, recentNames, favouriteIds, user, adaptiveTargetsMap] =
    await Promise.all([
      Recipe.find({}).lean(),
      getRecentlyEatenMap(userId),
      getFavouriteIds(userId),
      User.findById(userId).select("allergies").lean(),
      getAllAdaptiveTargets(userId, dailyTarget, dates),   // FIX-3 + OPT-1
    ]);

  const recipes   = normalizeRecipes(rawRecipes, user?.allergies || []);
  const poolCache = buildPoolCache(recipes);   // OPT-4

  // 3. Weekly shared context
  const weekContext = {
    usedNames      : new Set(),        // tích lũy cả tuần → tránh lặp
    favouriteIds,
    recentEatenMap : recentNames,
  };

  const weekPlan     = [];
  const logPromises  = [];

  for (let i = 0; i < numDays; i++) {
    const dayDate        = dates[i];
    const adaptiveTarget = adaptiveTargetsMap.get(toDateOnly(dayDate).toISOString())
                        || dailyTarget;

    // Per-day context: protein/category diversity reset hàng ngày
    const dayContext = {
      usedNames      : weekContext.usedNames,   // shared → tránh lặp cả tuần
      usedMealSources: new Map(),               // reset mỗi ngày
      usedCategories : new Map(),               // reset mỗi ngày
      favouriteIds,
      recentEatenMap : weekContext.recentEatenMap,
    };

    const { meals, dailyTotal } = buildDayPlan(
      poolCache, adaptiveTarget, goal, dayContext,
    );

    weekPlan.push({ dayIndex: i + 1, date: toDateOnly(dayDate), meals, dailyTotal });

    if (saveToDB) {
      const logDate = toDateOnly(dayDate);
      logPromises.push(
        DailyMenu.findOneAndUpdate(
          { userId, date: logDate },
          { userId, date: logDate, meals, dailyTotalNutrition: dailyTotal, dailyTargetNutrition: adaptiveTarget, source: "recommended" },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ),
      );
    }
  }

  if (saveToDB) await Promise.all(logPromises);

  const weeklyTotal = weekPlan.reduce(
    (acc, day) => {
      acc.calories += day.dailyTotal.calories;
      acc.protein  += day.dailyTotal.protein;
      acc.fat      += day.dailyTotal.fat;
      acc.carbs    += day.dailyTotal.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
  for (const k in weeklyTotal)
    weeklyTotal[k] = parseFloat(weeklyTotal[k].toFixed(1));

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + numDays - 1);

  return {
    startDate   : toDateOnly(startDate),
    endDate     : toDateOnly(endDate),
    goal,
    tdee        : parseFloat(tdee.toFixed(0)),
    dailyTarget,
    weekPlan,
    weeklyTotal,
    weeklyAverage: {
      calories: parseFloat((weeklyTotal.calories / numDays).toFixed(1)),
      protein : parseFloat((weeklyTotal.protein  / numDays).toFixed(1)),
      fat     : parseFloat((weeklyTotal.fat       / numDays).toFixed(1)),
      carbs   : parseFloat((weeklyTotal.carbs     / numDays).toFixed(1)),
    },
  };
}

module.exports = { recommendDayPlan, recommendWeekPlan };