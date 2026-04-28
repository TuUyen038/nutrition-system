const workoutRecommendationService = require("../services/workoutRecommendation.service");

/**
 * Generate workout plan for user
 */
const generateWorkoutPlan = async (req, res) => {
  try {
    const userId = req.user._id; // From auth middleware

    const workoutPlan = await workoutRecommendationService.generateWorkoutPlan(userId);

    return res.json({
      success: true,
      data: workoutPlan,
    });
  } catch (error) {
    console.error("generateWorkoutPlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate workout plan",
    });
  }
};

/**
 * Get workout level for user
 */
const getWorkoutLevel = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await require("../models/User").findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const workoutLevel = workoutRecommendationService.getWorkoutLevel(user.fitnessLevel);

    return res.json({
      success: true,
      data: {
        fitnessLevel: user.fitnessLevel,
        workoutLevel,
      },
    });
  } catch (error) {
    console.error("getWorkoutLevel error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get workout level",
    });
  }
};

module.exports = {
  generateWorkoutPlan,
  getWorkoutLevel,
};