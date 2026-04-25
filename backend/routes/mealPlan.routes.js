const express = require('express');
const router = express.Router();
const mealPlanController = require('../controllers/mealPlan.controller');
const { authenticate } = require('../middlewares/auth');
const rcmController = require("../controllers/mealRcm.controller");
// Tất cả route đều cần xác thực
router.use(authenticate);

// POST /api/v1/mealplans - Tạo MealPlan mới (AI gợi ý hoặc User tự tạo)
router.post('/', mealPlanController.createMealPlan);


// GET /mealplans/by-startdate?startDate=YYYY-MM-DD
router.get('/by-startdate', mealPlanController.getMealPlanByStartDate);
router.get("/status", mealPlanController.getWeekStatus);

// GET /api/v1/mealplans/:planId - Lấy chi tiết Plan
router.get('/:planId', mealPlanController.getMealPlanDetail);

// GET /api/v1/mealplans - Lấy danh sách MealPlan của người dùng
router.get('/', mealPlanController.getMealPlans);

// PATCH /api/v1/mealplans/:planId/status - Cập nhật trạng thái Plan
router.patch('/:planId/status', mealPlanController.updatePlanStatus);

// DELETE /api/v1/mealplans/:planId - Xóa Plan (Chỉ cho phép xóa Plan ở trạng thái 'suggested')
router.delete('/:planId', mealPlanController.deleteMealPlan);

// gợi ý tuần
router.post("/recommendations/week", mealPlanController.recommendWeek);

module.exports = router;
