const express = require("express");
const router = express.Router();

const workoutPlanController = require("../controllers/workoutPlan.controller");
const { authenticate } = require("../middlewares/auth");

// All routes require authentication
router.use(authenticate);

/**
 * ============================================
 * WORKOUT PLAN ROUTES
 * ============================================
 * Optimized for frontend performance
 */

// GET /workout-plan/current - Get current weekly plan (lightweight)
router.get("/current", workoutPlanController.getCurrentPlan);

// GET /workout-plan/current/detailed - Get current plan with full exercise details
router.get("/current/detailed", workoutPlanController.getDetailedPlan);

// POST /workout-plan/generate - Manually generate plan
router.post("/generate", workoutPlanController.generatePlan);

// POST /workout-plan/regenerate - Regenerate plan
router.post("/regenerate", workoutPlanController.regeneratePlan);

// PATCH /workout-plan/day/:day/complete - Mark day as completed
router.patch("/day/:day/complete", workoutPlanController.markDayCompleted);

// GET /workout-plan/stats - Get workout statistics
router.get("/stats", workoutPlanController.getStats);

module.exports = router;