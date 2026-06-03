const workoutSessionService = require(
  "../services/workoutSession.service"
);

/**
 * ============================================
 * START WORKOUT
 * ============================================
 */
const startWorkout = async (req, res) => {
  try {
    const {
      userId,
      planId,
      day,
      exerciseId,
    } = req.body;

    if (
      !userId ||
      !planId ||
      !day ||
      !exerciseId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "userId, planId, day, exerciseId are required",
      });
    }

    const session =
      await workoutSessionService.startWorkout({
        userId,
        planId,
        day,
        exerciseId,
      });

    return res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error(
      "startWorkout error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * ============================================
 * STOP WORKOUT
 * ============================================
 */
const stopWorkout = async (req, res) => {
  try {
    const {
      sessionId,
      completedSets,
      completedReps,
      perceivedDifficulty,
    } = req.body;

    if (
      !sessionId ||
      completedSets == null ||
      completedReps == null ||
      perceivedDifficulty == null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "sessionId, completedSets, completedReps, perceivedDifficulty are required",
      });
    }

    const session =
      await workoutSessionService.stopWorkout({
        sessionId,
        completedSets,
        completedReps,
        perceivedDifficulty,
      });

    return res.json({
      success: true,
      data: session,
      message:
        "Workout completed successfully",
    });
  } catch (error) {
    console.error(
      "stopWorkout error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * ============================================
 * COMPLETE WORKOUT
 * ============================================
 * Alias for stopWorkout
 */
const completeWorkout = async (
  req,
  res
) => {
  return stopWorkout(req, res);
};

/**
 * ============================================
 * GET TODAY KCAL
 * ============================================
 */
const getTodayKcal = async (
  req,
  res
) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message:
          "userId is required",
      });
    }

    const result =
      await workoutSessionService.getTodayKcal(
        userId
      );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "getTodayKcal error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Error retrieving today's kcal",
    });
  }
};

module.exports = {
  startWorkout,
  stopWorkout,
  completeWorkout,
  getTodayKcal,
};