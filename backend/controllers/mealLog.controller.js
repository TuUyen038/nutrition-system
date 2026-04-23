/**
 * Các API này dùng để:
 * - Lấy lịch sử ăn uống (cho trang History)
 * - Xem thống kê dinh dưỡng theo ngày/tuần
 * - Xóa meal log (khi user uncheck recipe)
 */

const {
  getMealHistory,
  getMealStats,
  getDayMeals,
  deleteMealLog,
  deleteMealLogsByDate,
} = require("../services/mealLog.service");

// ─────────────────────────────────────────────────────────────
// GET lịch sử ăn uống (pagination)
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/meal-logs/history?days=7&page=1&limit=20
 *
 * Lấy danh sách meal logs với pagination.
 */
async function getMealHistoryController(req, res) {
  try {
    const userId = req.user._id;
    const { days = 7, page = 1, limit = 20 } = req.query;

    const result = await getMealHistory(userId, {
      days: Number(days),
      page: Number(page),
      limit: Number(limit),
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("[getMealHistoryController] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET thống kê dinh dưỡng
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/meal-logs/stats?days=7
 *
 * Lấy tổng cộng calories, protein, fat, carbs trong N ngày.
 * Dùng cho trang Dashboard/Analysis.
 */
async function getMealStatsController(req, res) {
  try {
    const userId = req.user._id;
    const { days = 7 } = req.query;

    const stats = await getMealStats(userId, {
      days: Number(days),
    });

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("[getMealStatsController] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET meals của 1 ngày nhất định
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/meal-logs/day/:date
 * @param {string} date - YYYY-MM-DD
 *
 * Lấy tất cả meals được ăn trong ngày (theo eatenAt).
 */
async function getDayMealsController(req, res) {
  try {
    const userId = req.user._id;
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required (YYYY-MM-DD)",
      });
    }

    const meals = await getDayMeals(userId, date);

    return res.status(200).json({
      success: true,
      data: {
        date,
        meals,
        totalMeals: meals.length,
      },
    });
  } catch (err) {
    console.error("[getDayMealsController] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE meal log khi uncheck recipe
// ─────────────────────────────────────────────────────────────
/**
 * DELETE /api/meal-logs/:recipeName/:date
 * @param {string} recipeName - tên recipe
 * @param {string} date       - YYYY-MM-DD
 *
 * Xóa meal log khi user uncheck recipe trong DailyMenu.
 */
async function deleteMealLogController(req, res) {
  try {
    const userId = req.user._id;
    const { recipeName, date } = req.params;

    if (!recipeName || !date) {
      return res.status(400).json({
        success: false,
        message: "recipeName and date parameters are required",
      });
    }

    const result = await deleteMealLog(userId, recipeName, date);

    return res.status(200).json({
      success: true,
      data: {
        message: `Deleted ${result.deletedCount} meal log(s)`,
        deletedCount: result.deletedCount,
      },
    });
  } catch (err) {
    console.error("[deleteMealLogController] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE tất cả meals của 1 ngày
// ─────────────────────────────────────────────────────────────
/**
 * DELETE /api/meal-logs/date/:date
 * @param {string} date - YYYY-MM-DD
 *
 * Xóa tất cả meal logs của ngày (khi user reset daily menu).
 */
async function deleteMealLogsByDateController(req, res) {
  try {
    const userId = req.user._id;
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required (YYYY-MM-DD)",
      });
    }

    const result = await deleteMealLogsByDate(userId, date);

    return res.status(200).json({
      success: true,
      data: {
        message: `Deleted ${result.deletedCount} meal log(s) for ${date}`,
        deletedCount: result.deletedCount,
      },
    });
  } catch (err) {
    console.error("[deleteMealLogsByDateController] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}

module.exports = {
  getMealHistoryController,
  getMealStatsController,
  getDayMealsController,
  deleteMealLogController,
  deleteMealLogsByDateController,
};
