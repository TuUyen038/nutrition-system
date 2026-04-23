/**
 * mealLog.routes.js
 *
 * Routes cho MealLog API.
 * Base path: /api/meal-logs
 *
 * API endpoints:
 * - GET  /api/meal-logs/history       → getMealHistory (pagination)
 * - GET  /api/meal-logs/stats         → getMealStats (thống kê)
 * - GET  /api/meal-logs/day/:date     → getDayMeals (meals của ngày)
 * - DELETE /api/meal-logs/:recipeName/:date → deleteMealLog
 * - DELETE /api/meal-logs/date/:date  → deleteMealLogsByDate
 */

const express = require("express");
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const {
  getMealHistoryController,
  getMealStatsController,
  getDayMealsController,
  deleteMealLogController,
  deleteMealLogsByDateController,
} = require("../controllers/mealLog.controller");

// ─────────────────────────────────────────────────────────────
// Protect tất cả routes với authentication
// ─────────────────────────────────────────────────────────────
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET - QUERY
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/meal-logs/history?days=7&page=1&limit=20
 * Lấy lịch sử ăn uống với pagination
 */
router.get("/history", getMealHistoryController);

/**
 * GET /api/meal-logs/stats?days=7
 * Lấy thống kê dinh dưỡng
 */
router.get("/stats", getMealStatsController);

/**
 * GET /api/meal-logs/day/:date
 * Lấy meals của 1 ngày nhất định
 */
router.get("/day/:date", getDayMealsController);

// ─────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/meal-logs/:recipeName/:date
 * Xóa 1 meal log (khi uncheck recipe)
 */
router.delete("/:recipeName/:date", deleteMealLogController);

/**
 * DELETE /api/meal-logs/date/:date
 * Xóa tất cả meal logs của 1 ngày (khi reset)
 * Route này phải sau cái trên vì :recipeName sẽ match "date" và gây lỗi
 */
// Note: Cần để router này ở sau để tránh conflict. 
// Hoặc có thể sử dụng route chính xác hơn

module.exports = router;
