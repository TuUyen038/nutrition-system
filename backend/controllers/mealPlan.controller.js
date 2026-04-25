const mealPlanService = require("../services/mealPlan.service");
const {
  recommendWeekPlan,
} = require("../services/mealRecommendation.service");

/**
 * POST /api/v1/mealplans/recommendations/week
 * Body: { startDate?: "YYYY-MM-DD", days?: number, saveToDB?: boolean }
 */
exports.recommendWeek = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, days = 7, saveToDB = true } = req.body;
 
    const result = await recommendWeekPlan(userId, {
      startDate: startDate ? new Date(startDate) : new Date(),
      days: Number(days),
      saveToDB,
    });
 
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/v1/mealplans
 * Tạo MealPlan thủ công (user tự tạo, không AI).
 * Body: { startDate: "YYYY-MM-DD", period?: "week" }
 */
exports.createMealPlan = async (req, res) => {
  try {
    const userId = req.user._id;
    const plan = await mealPlanService.createPlan(userId, req.body);
    return res.status(201).json({ success: true, data: plan });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/v1/mealplans/by-startdate?startDate=YYYY-MM-DD
 * Lấy MealPlan theo ngày bắt đầu (có populate DailyMenu + Recipe).
 */
exports.getMealPlanByStartDate = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate } = req.query;

    if (!startDate) {
      return res.status(400).json({ success: false, message: "Thiếu tham số startDate." });
    }

    const plan = await mealPlanService.getPlanByStartDate(userId, startDate);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy MealPlan." });
    }

    return res.status(200).json({ success: true, data: plan });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/v1/mealplans/status?startDate=YYYY-MM-DD&days=7
 * Kiểm tra các ngày trong tuần đã có DailyMenu chưa.
 * Dùng trước khi gọi AI suggest để hỏi user có muốn ghi đè không.
 */
exports.getWeekStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, days } = req.query;

    if (!startDate) {
      return res.status(400).json({ success: false, message: "Thiếu tham số startDate." });
    }

    const result = await mealPlanService.checkWeekDailyMenus({
      userId,
      startDateStr: startDate,
      days: days ? Number(days) : 7,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/v1/mealplans/:planId
 * Lấy chi tiết 1 MealPlan (có populate DailyMenu + Recipe).
 */
exports.getMealPlanDetail = async (req, res) => {
  try {
    const plan = await mealPlanService.getPlanById(req.params.planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy MealPlan." });
    }

    return res.status(200).json({ success: true, data: plan });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/v1/mealplans?status=suggested
 * Lấy danh sách MealPlan của user, hỗ trợ filter theo status.
 */
exports.getMealPlans = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const plans = await mealPlanService.getPlansByUserId(userId, filter);
    return res.status(200).json({ success: true, data: plans });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/v1/mealplans/:planId/status
 * Cập nhật trạng thái MealPlan.
 * Body: { status: "selected" | "completed" | "deleted" | "expired" | ... }
 */
exports.updatePlanStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { planId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "Thiếu trường status." });
    }

    const updated = await mealPlanService.updatePlanStatus(userId, planId, status);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/v1/mealplans/:planId
 * Xóa mềm MealPlan (status -> "deleted").
 */
exports.deleteMealPlan = async (req, res) => {
  try {
    const userId = req.user._id;
    const { planId } = req.params;

    const deleted = await mealPlanService.deletePlan(userId, planId);
    return res.status(200).json({ success: true, data: deleted });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};