/**
 * mealLog.service.js
 *
 * - Tạo/xóa meal log khi user check/uncheck recipe trong DailyMenu
 * - Lấy lịch sử ăn uống (hiển thị trang history)
 * - Lấy recently eaten map cho recommendation engine
 */

const MealLog = require("../models/MealLog");
const Recipe = require("../models/Recipe");
const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

// ─────────────────────────────────────────────────────────────
// CREATE / DELETE
// ─────────────────────────────────────────────────────────────

/**
 * Tạo meal log khi recipe được check (isChecked = true) trong DailyMenu.
 * Idempotent: nếu đã tồn tại → không tạo lại
 *
 * @param {string|ObjectId} userId
 * @param {Object} recipeItem      - recipe item từ DailyMenu.recipes[i]
 * @param {string|Date} date       - ngày ăn
 * @param {string|ObjectId} dailyMenuId - (optional) ID của DailyMenu nếu từ DailyMenu
 * @returns {Object|null}          - newly created MealLog hoặc null
 */
async function createMealLog(userId, recipeItem, date, dailyMenuId = null) {
  try {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const query = {
      userId,
      "recipe.recipeId": recipeItem.recipeId, // 🔥 dùng id
      eatenAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (dailyMenuId) {
      query.dailyMenuId = dailyMenuId;
    }

    const existed = await MealLog.findOne(query);

    if (existed) {
      console.log(
        `[createMealLog] MealLog already exists for ${recipeItem.name} on ${date}`
      );
      return null;
    }

    const mealLog = await MealLog.create({
      userId,
      eatenAt: start, // hoặc toDateOnly cũng được
      dailyMenuId: dailyMenuId || null,
      recipe: {
        recipeId: recipeItem.recipeId,
        name: recipeItem.name,
        imageUrl: recipeItem.imageUrl,
        description: recipeItem.description,
        mealSource: recipeItem.mealSource || "none",
        scale: recipeItem.scale || 1.0,
        nutrition: recipeItem.nutrition || {
          calories: 0,
          protein: 0,
          fat: 0,
          carbs: 0,
          fiber: 0,
          sugar: 0,
          sodium: 0,
        },
      },
    });

    console.log(
      `[createMealLog] Created MealLog:`,
      mealLog._id,
      dailyMenuId ? `for DailyMenu: ${dailyMenuId}` : ""
    );

    return mealLog;
  } catch (err) {
    console.error("[createMealLog] Error:", err);
    throw err;
  }
}

/**
 * Xóa meal log khi recipe được uncheck (isChecked = false) trong DailyMenu.
 *
 * @param {string|ObjectId} userId
 * @param {string} recipeName       - tên recipe để tìm log
 * @param {string|Date} date        - ngày ăn
 * @param {string|ObjectId} dailyMenuId - (optional) ID của DailyMenu để xóa chính xác
 * @returns {Object}                - { deletedCount: number }
 */
async function deleteMealLog(userId, recipeId, date, dailyMenuId = null) {
  try {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const query = {
      userId: new mongoose.Types.ObjectId(userId), // 🔥 fix
      "recipe.recipeId": new mongoose.Types.ObjectId(recipeId), // 🔥 fix
      eatenAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (dailyMenuId) {
      query.dailyMenuId = new mongoose.Types.ObjectId(dailyMenuId); // 🔥 fix
    }

    console.log("DELETE QUERY:", query);

    const result = await MealLog.deleteOne(query);

    console.log(`[deleteMealLog] Deleted ${result.deletedCount}`);

    return result;
  } catch (err) {
    console.error("[deleteMealLog] Error:", err);
    throw err;
  }
}


/**
 * Xóa tất cả meal log của user trong ngày nhất định.
 * Dùng khi user reset daily menu hoặc hủy ngày.
 *
 * @param {string|ObjectId} userId
 * @param {string|Date} date
 * @returns {Object} - { deletedCount: number }
 */
async function deleteMealLogsByDate(userId, dateString) {
  try {
    // 1. Xác định mốc thời gian: 00:00:00 của ngày cần xóa
    const startOfDay = new Date(dateString);
    startOfDay.setHours(0, 0, 0, 0);

    // 2. Xác định mốc thời gian: 00:00:00 của ngày tiếp theo
    const startOfNextDay = new Date(startOfDay);
    startOfNextDay.setDate(startOfNextDay.getDate() + 1);

    // 3. Xóa bằng range query (Tận dụng Index)
    const result = await MealLog.deleteMany({
      userId,
      eatenAt: {
        $gte: startOfDay,
        $lt: startOfNextDay
      }
    });

    console.log(`[deleteMealLogsByDate] Deleted ${result.deletedCount} logs`);
    return result;
  } catch (err) {
    console.error("[deleteMealLogsByDate] Error:", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// HISTORY / QUERY
// ─────────────────────────────────────────────────────────────

/**
 * Lấy lịch sử ăn uống (cho trang History).
 * Pagination + sorting + filtering.
 *
 * @param {string|ObjectId} userId
 * @param {Object} options
 * @param {number} options.days    - lookback days (default: 7)
 * @param {number} options.page    - page number (default: 1)
 * @param {number} options.limit   - items per page (default: 20)
 * @param {string} options.sortBy  - sort field (default: "eatenAt")
 * @returns {Object} - { logs, pagination }
 */
async function getMealHistory(userId, options = {}) {
  try {
    const {
      days = 7,
      page = 1,
      limit = 20,
      sortBy = "eatenAt",
    } = options;

    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      MealLog.find({
        userId,
        eatenAt: { $gte: since },
      })
        .sort({ [sortBy]: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate({
          path: "recipe.recipeId",
          model: "Recipe",
          select: "name imageUrl description scale nutrition",
        })
        .lean(),
      MealLog.countDocuments({
        userId,
        eatenAt: { $gte: since },
      }),
    ]);

    return {
      logs: logs.map((log) => ({
        _id: log._id,
        eatenAt: log.eatenAt,
        recipe: {
          name: log.recipe.name,
          imageUrl: log.recipe.imageUrl,
          mealSource: log.recipe.mealSource,
          nutrition: log.recipe.nutrition,
        },
        createdAt: log.createdAt,
      })),
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  } catch (err) {
    console.error("[getMealHistory] Error:", err);
    throw err;
  }
}

/**
 * Lấy thống kê ăn uống trong khoảng thời gian.
 * Dùng cho trang dashboard/analysis.
 *
 * @param {string|ObjectId} userId
 * @param {Object} options
 * @param {number} options.days - lookback days
 * @returns {Object} - { totalMeals, totalCalories, averagePerDay, ... }
 */
async function getMealStats(userId, options = {}) {
  try {
    const { days = 7 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await MealLog.find({
      userId,
      eatenAt: { $gte: since },
    }).lean();

    if (!logs.length) {
      return {
        totalMeals: 0,
        totalCalories: 0,
        totalProtein: 0,
        totalFat: 0,
        totalCarbs: 0,
        averagePerDay: 0,
      };
    }

    const stats = logs.reduce(
      (acc, log) => {
        acc.totalMeals += 1;
        acc.totalCalories += log.recipe?.nutrition?.calories || 0;
        acc.totalProtein += log.recipe?.nutrition?.protein || 0;
        acc.totalFat += log.recipe?.nutrition?.fat || 0;
        acc.totalCarbs += log.recipe?.nutrition?.carbs || 0;
        return acc;
      },
      {
        totalMeals: 0,
        totalCalories: 0,
        totalProtein: 0,
        totalFat: 0,
        totalCarbs: 0,
      }
    );

    return {
      ...stats,
      averagePerDay: parseFloat((stats.totalCalories / days).toFixed(1)),
    };
  } catch (err) {
    console.error("[getMealStats] Error:", err);
    throw err;
  }
}

/**
 * Lấy danh sách món ăn được ăn trong ngày nhất định.
 *
 * @param {string|ObjectId} userId
 * @param {string|Date} date
 * @returns {Array} - mảng meal logs của ngày đó
 */
async function getDayMeals(userId, date) {
  try {
    // 1. Tạo khoảng thời gian bắt đầu và kết thúc của ngày (Index-friendly)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // 2. Thực hiện query sử dụng range
    const logs = await MealLog.find({
      userId,
      eatenAt: {
        $gte: startOfDay, // Lớn hơn hoặc bằng 00:00:00
        $lt: endOfDay     // Nhỏ hơn 00:00:00 ngày hôm sau
      }
    })
    .sort({ eatenAt: -1 }) // Sắp xếp từ mới nhất đến cũ nhất trong ngày
    .populate({
      path: "recipe.recipeId",
      model: "Recipe",
      select: "name category imageUrl totalNutritionPerServing",
    })
    .lean(); // Giúp query nhanh hơn và trả về plain JS object

    return logs;
  } catch (err) {
    console.error("[getDayMeals] Error:", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// RECOMMENDATION ENGINE SUPPORT
// ─────────────────────────────────────────────────────────────

/**
 * Lấy recently eaten map cho recommendation engine.
 * Dùng bởi mealRecommendation.service.js để tính novelty score.
 *
 * @param {string|ObjectId} userId
 * @param {number} lookbackDays
 * @returns {Map<string, number>}  name → daysAgo
 */
async function getRecentlyEatenMap(userId, lookbackDays = 7) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const logs = await MealLog.find({
      userId,
      eatenAt: { $gte: since },
    })
      .sort({ eatenAt: -1 })
      .lean();

    const eatenMap = new Map();
    const today = toDateOnly(new Date());

    logs.forEach((log) => {
      const diffDays = Math.ceil(
        (today - toDateOnly(log.eatenAt)) / (1000 * 60 * 60 * 24)
      );
      const name = log.recipe?.name || "";
      if (name && !eatenMap.has(name)) {
        eatenMap.set(name, diffDays);
      }
    });

    console.log(
      `[getRecentlyEatenMap] Found ${eatenMap.size} unique recently eaten items`
    );
    return eatenMap;
  } catch (err) {
    console.error("[getRecentlyEatenMap] Error:", err);
    throw err;
  }
}

/**
 * Lấy usage stats của recipes (dùng bao nhiêu lần).
 * Dùng cho ranking/diversity trong recommendation.
 *
 * @param {string|ObjectId} userId
 * @param {number} lookbackDays
 * @returns {Object} - { countMap, last3DaysSet }
 */
async function getRecipeUsageStats(userId, lookbackDays = 14) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const logs = await MealLog.find({
      userId,
      eatenAt: { $gte: since },
    }).lean();

    const countMap = new Map();
    const last3DaysSet = new Set();

    logs.forEach((log) => {
      const recipeId = String(log.recipe?.recipeId || "");
      if (recipeId) {
        countMap.set(recipeId, (countMap.get(recipeId) || 0) + 1);

        if (log.eatenAt >= threeDaysAgo) {
          last3DaysSet.add(recipeId);
        }
      }
    });

    return { countMap, last3DaysSet };
  } catch (err) {
    console.error("[getRecipeUsageStats] Error:", err);
    throw err;
  }
}

module.exports = {
  // Create / Delete
  createMealLog,
  deleteMealLog,
  deleteMealLogsByDate,

  // History / Query
  getMealHistory,
  getMealStats,
  getDayMeals,

  // Recommendation support
  getRecentlyEatenMap,
  getRecipeUsageStats,
};
