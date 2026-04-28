const workoutSessionService = require("../services/workoutSession.service");

/**
 * ============================================
 * WORKOUT SESSION CONTROLLER
 * ============================================
 * Handles workout session HTTP requests
 */

const startWorkout = async (req, res) => {
  try {
    const { userId, exerciseId, intensity } = req.body;

    // Validate input
    if (!userId || !exerciseId || !intensity) {
      return res.status(400).json({
        success: false,
        message: "userId, exerciseId, and intensity are required",
      });
    }

    const session = await workoutSessionService.startWorkout({ userId, exerciseId, intensity });
    return res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("startWorkout error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const stopWorkout = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
    }

    const session = await workoutSessionService.stopWorkout(sessionId);
    return res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("stopWorkout error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /workout-session/complete
 * Complete workout session and calculate calories burned
 * This is an alias for stopWorkout with more descriptive naming
 */
const completeWorkout = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
    }

    const session = await workoutSessionService.stopWorkout(sessionId);
    return res.json({
      success: true,
      data: session,
      message: "Workout completed successfully",
    });
  } catch (error) {
    console.error("completeWorkout error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getTodayKcal = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const result = await workoutSessionService.getTodayKcal(userId);
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("getTodayKcal error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving today's kcal",
    });
  }
};

module.exports = {
  startWorkout,
  stopWorkout,
  completeWorkout,
  getTodayKcal,
};