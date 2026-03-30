const workoutSessionService = require("../services/workoutSession.service");

const startWorkout = async (req, res) => {
  try {
    const { userId, exerciseId, intensity } = req.body;
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

const getTodayKcal = async (req, res) => {
  try {
    const { userId } = req.query;
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
  getTodayKcal,
};