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

// POST /workout-plan/generate - Manually generate plan
router.post("/generate", workoutPlanController.generateWeeklyPlan);

// COMPLETE day
router.patch("/complete-day", workoutPlanController.completeWorkoutDay);

// PATCH /workout-plan/day/:day/skip - Skip day
router.patch("/skip-day", workoutPlanController.skipWorkoutDay);

// NEXT week
router.post("/generate-next-week", workoutPlanController.generateNextWeek);

// GET /workout-plan/stats - Get workout statistics
router.get("/stats", workoutPlanController.getPlanStats);

// GET workout ngày hôm nay
router.get("/today", workoutPlanController.getTodayWorkout);

// GET /workout-plan/training-state?sync=true - Fatigue / Recovery / Performance
router.get("/training-state", workoutPlanController.getTrainingState);

// GET /workout-plan/exercise-ranking?focus=push&limit=10 - Scored exercises
router.get("/exercise-ranking", workoutPlanController.getExerciseRanking);

module.exports = router;