const express = require("express");
const router = express.Router();
const fitnessPlanController = require("../controllers/fitnessPlan.controller");
const { authenticate } = require("../middlewares/auth");
const rcmController = require("../controllers/mealRcm.controller");
// Tất cả route đều cần xác thực
router.use(authenticate);

router.post("/weekly-plan", fitnessPlanController.generateWeeklyPlan);

module.exports = router;
