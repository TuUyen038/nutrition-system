const workoutPlanService = require(
  "../services/workoutPlan.service"
);
const trainingStateService = require(
  "../services/trainingState.service"
);
const workoutRecommendationService = require(
  "../services/workoutRecommendation.service"
);
const adaptivePlanService = require(
  "../services/adaptivePlan.service"
);
const exerciseSubstitutionService = require(
  "../services/exerciseSubstitution.service"
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

    // ?force=true rebuilds this week's plan (no exercise started yet).
    const { plan, regenerated } =
      await workoutPlanService.regenerateCurrentWeek(userId, {
        force: req.query.force === "true",
      });

    return res.json({
      success: true,
      message: regenerated
        ? "Weekly workout plan generated successfully"
        : "This week already has a plan (use ?force=true to rebuild it)",
      data: plan,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] generateWeeklyPlan:",
      error
    );

    return res.status(error.statusCode || 500).json({
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

const getTodayWorkout = async (req, res) => {
  try {
    const userId = req.user._id;

    const workout =
      await workoutPlanService.getTodayWorkout(userId);

    return res.json({
      success: true,
      data: workout,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] getTodayWorkout:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get today workout",
    });
  }
};

// =====================================
// GET TRAINING STATE (fatigue / recovery / performance)
// =====================================

const getTrainingState = async (req, res) => {
  try {
    const userId = req.user._id;

    const state =
      await trainingStateService.getTrainingState(userId, {
        sync: req.query.sync === "true",
      });

    return res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] getTrainingState:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get training state",
    });
  }
};

// =====================================
// PREVIEW EXERCISE RANKING
// =====================================

const getExerciseRanking = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    const ranking =
      await workoutRecommendationService.previewExerciseRanking(
        userId,
        req.query.focus,
        limit
      );

    return res.json({
      success: true,
      data: ranking,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] getExerciseRanking:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to rank exercises",
    });
  }
};

// =====================================
// ADAPT CURRENT PLAN (step 6)
// =====================================

const adaptPlan = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await adaptivePlanService.adaptPlan(userId, {
      sync: req.query.sync === "true",
      dryRun: req.query.dryRun === "true",
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] adaptPlan:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to adapt workout plan",
    });
  }
};

// =====================================
// EXERCISE SUBSTITUTION (step 7)
// =====================================

const getExerciseAlternatives = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await exerciseSubstitutionService.getAlternatives(
      userId,
      Number(req.params.day),
      Number(req.params.exerciseId),
      {
        limit: Number(req.query.limit) || undefined,
        reason: req.query.reason || null,
      }
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] getExerciseAlternatives:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to get alternatives",
    });
  }
};

const replaceExercise = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await exerciseSubstitutionService.replaceExercise(
      userId,
      Number(req.params.day),
      Number(req.params.exerciseId),
      {
        newExerciseId: Number(req.body?.newExerciseId),
        reason: req.body?.reason || "other",
      }
    );

    return res.json({
      success: true,
      message: "Exercise replaced",
      data: result,
    });
  } catch (error) {
    console.error(
      "[WorkoutPlan] replaceExercise:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to replace exercise",
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
  getTodayWorkout,
  getTrainingState,
  getExerciseRanking,
  adaptPlan,
  getExerciseAlternatives,
  replaceExercise,
};