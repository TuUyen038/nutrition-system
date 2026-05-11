const workoutPlanService = require(
  "../services/workoutPlan.service"
);

// =====================================
// GET CURRENT WEEK PLAN
// =====================================

const getCurrentPlan = async (req, res) => {
  try {
    const userId = req.user._id;

    const plan =
      await workoutPlanService.getCurrentPlan(userId);

    return res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] getCurrentPlan:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get current workout plan",
    });
  }
};

// =====================================
// GENERATE FIRST WEEK PLAN
// =====================================

const generateWeeklyPlan = async (req, res) => {
  try {
    const userId = req.user._id;

    const plan =
      await workoutPlanService.generateWeeklyPlan(
        userId
      );

    return res.json({
      success: true,
      message:
        "Weekly workout plan generated successfully",
      data: plan,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] generateWeeklyPlan:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to generate workout plan",
    });
  }
};

// =====================================
// COMPLETE WORKOUT DAY
// =====================================

const completeWorkoutDay = async (req, res) => {
  try {
    const userId = req.user._id;

    const { day } = req.body;

    if (!day) {
      return res.status(400).json({
        success: false,
        message: "day is required",
      });
    }

    const updatedPlan =
      await workoutPlanService.completeWorkoutDay(
        userId,
        day
      );

    return res.json({
      success: true,
      message: `Day ${day} completed`,
      data: updatedPlan,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] completeWorkoutDay:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to complete workout day",
    });
  }
};

// =====================================
// GENERATE NEXT WEEK
// =====================================

const generateNextWeek = async (req, res) => {
  try {
    const userId = req.user._id;

    const newPlan =
      await workoutPlanService.generateNextWeek(
        userId
      );

    return res.json({
      success: true,
      message:
        "Next adaptive workout week generated",
      data: newPlan,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] generateNextWeek:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to generate next week",
    });
  }
};

// =====================================
// GET PLAN STATS
// =====================================

const getPlanStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const stats =
      await workoutPlanService.getPlanStats(userId);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] getPlanStats:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get workout stats",
    });
  }
};

// =====================================
// SKIP DAY
// =====================================

const skipWorkoutDay = async (req, res) => {
  try {
    const userId = req.user._id;

    const { day } = req.body;

    const updatedPlan =
      await workoutPlanService.skipWorkoutDay(
        userId,
        day
      );

    return res.json({
      success: true,
      message: `Day ${day} skipped`,
      data: updatedPlan,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] skipWorkoutDay:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to skip workout day",
    });
  }
};

module.exports = {
  getCurrentPlan,
  generateWeeklyPlan,
  completeWorkoutDay,
  generateNextWeek,
  getPlanStats,
  skipWorkoutDay,
};