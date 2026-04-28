const workoutPlanService = require("../services/workoutPlan.service");

/**
 * ============================================
 * WORKOUT PLAN CONTROLLER
 * ============================================
 * Handles HTTP requests for workout plan
 * Optimized for minimal API calls
 */

/**
 * GET /workout-plan/current
 * Get current weekly plan for logged-in user
 * If not exists → auto generate
 */
const getCurrentPlan = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get lightweight plan (only exerciseIds)
    const plan = await workoutPlanService.getCurrentPlan(userId);

    return res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("[WorkoutPlan Controller] getCurrentPlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get workout plan",
    });
  }
};

/**
 * GET /workout-plan/current/detailed
 * Get current plan with full exercise details
 * Optimized: single batch query for all exercises
 */
const getDetailedPlan = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get plan with exercises populated
    const plan = await workoutPlanService.getPlanWithExercises(userId);

    return res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("[WorkoutPlan Controller] getDetailedPlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get detailed workout plan",
    });
  }
};

/**
 * POST /workout-plan/generate
 * Manually generate new workout plan
 */
const generatePlan = async (req, res) => {
  try {
    const userId = req.user._id;

    const plan = await workoutPlanService.generatePlan(userId);

    return res.json({
      success: true,
      data: plan,
      message: "Workout plan generated successfully",
    });
  } catch (error) {
    console.error("[WorkoutPlan Controller] generatePlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate workout plan",
    });
  }
};

/**
 * PATCH /workout-plan/complete
 * Mark a day as completed
 */
const markDayCompleted = async (req, res) => {
  try {
    const userId = req.user._id;

    const plan = await workoutPlanService.markDayCompleted(userId);

    return res.json({
      success: true,
      data: plan,
      message: "Next day completed",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /workout-plan/stats
 * Get workout statistics
 */
const getStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await workoutPlanService.getStats(userId);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("[WorkoutPlan Controller] getStats error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get workout stats",
    });
  }
};

/**
 * POST /workout-plan/regenerate
 * Regenerate workout plan
 */
const regeneratePlan = async (req, res) => {
  try {
    const userId = req.user._id;

    const plan = await workoutPlanService.regeneratePlan(userId);

    return res.json({
      success: true,
      data: plan,
      message: "Workout plan regenerated successfully",
    });
  } catch (error) {
    console.error("[WorkoutPlan Controller] regeneratePlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to regenerate workout plan",
    });
  }
};

module.exports = {
  getCurrentPlan,
  getDetailedPlan,
  generatePlan,
  markDayCompleted,
  getStats,
  regeneratePlan,
};