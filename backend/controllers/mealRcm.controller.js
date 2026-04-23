/**
 *
 *   POST /api/recommendations/day          → recommendDay
 *   POST /api/recommendations/week         → recommendWeek
 *
 */

const {
    recommendDayPlan,
    recommendWeekPlan,
} = require("../services/mealRecommendation.service");

// ─────────────────────────────────────────────────────────────
// GET thực đơn 1 ngày
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/recommendations/day
 * Body (optional): { date: "2025-07-20", saveToDB: true }
 */
async function recommendDay(req, res) {
    try {
        const userId = req.user._id; // từ auth middleware
        const { date, saveToDB = false } = req.body;

        const result = await recommendDayPlan(userId, {
            date:     date ? new Date(date) : new Date(),
            saveToDB: Boolean(saveToDB),
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error("[recommendDay] Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Internal server error",
        });
    }
}

// ─────────────────────────────────────────────────────────────
// GET thực đơn tuần
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/recommendations/week
 * Body (optional): { startDate: "2025-07-20", days: 7, saveToDB: true }
 */
async function recommendWeek(req, res) {
    try {
        const userId = req.user._id;
        const { startDate, days = 7, saveToDB = false } = req.body;

        const result = await recommendWeekPlan(userId, {
            startDate: startDate ? new Date(startDate) : new Date(),
            days:      Number(days),
            saveToDB:  Boolean(saveToDB),
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error("[recommendWeek] Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Internal server error",
        });
    }
}

module.exports = {
    recommendDay,
    recommendWeek,
};