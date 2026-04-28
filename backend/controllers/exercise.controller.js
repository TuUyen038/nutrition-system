const exerciseService = require("../services/exercise.service");

/**
 * ============================================
 * EXERCISE CONTROLLER
 * ============================================
 * Handles exercise-related HTTP requests
 * Includes batch endpoint for optimization
 */

async function importExercises(req, res) {
  try {
    const result = await exerciseService.importExercisesFromWger();

    return res.status(201).json({
      success: true,
      message: "Exercises imported successfully",
      data: result,
    });
  } catch (error) {
    console.error("[Exercise Controller] importExercises error", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to import exercises",
      error: error.message || "Unknown error",
    });
  }
}

async function getAllExercises(req, res) {
  try {
    const exercises = await exerciseService.getAllExercises();

    return res.status(200).json(exercises);
  } catch (error) {
    console.error("[Exercise Controller] getAllExercises error", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to fetch exercises", error: error.message || "Unknown error" });
  }
}

async function getExerciseById(req, res) {
  try {
    const exerciseId = Number(req.params.id);

    if (!exerciseId) {
      return res.status(400).json({ success: false, message: "Invalid exercise ID" });
    }

    const exercise = await exerciseService.getExerciseById(exerciseId);

    if (!exercise) {
      return res.status(404).json({ success: false, message: "Exercise not found" });
    }

    return res.status(200).json(exercise);
  } catch (error) {
    console.error("[Exercise Controller] getExerciseById error", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to fetch exercise", error: error.message || "Unknown error" });
  }
}

async function getExercises(req, res) {
  try {
    const filters = {
      categoryId: req.query.categoryId,
      muscleIds: req.query.muscleIds,
      equipmentIds: req.query.equipmentIds,
    };

    const exercises = await exerciseService.findExercises(filters);
    return res.status(200).json(exercises);
  } catch (error) {
    console.error("[Exercise Controller] getExercises error:", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to fetch exercises", error: error.message || "Unknown error" });
  }
}

/**
 * POST /exercises/batch
 * Batch fetch exercises by IDs
 * Optimized: single DB query for multiple exercises
 * Input: { ids: number[] }
 * Output: Full exercise data list
 */
async function getExercisesBatch(req, res) {
  try {
    const { ids } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid input: ids must be a non-empty array",
      });
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(ids.map((id) => Number(id)))];

    // Limit max IDs to prevent performance issues
    if (uniqueIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Maximum 100 exercise IDs allowed per request",
      });
    }

    // Single optimized query
    const exercises = await exerciseService.getExercisesByIds(uniqueIds);

    return res.json({
      success: true,
      data: exercises,
      meta: {
        requested: uniqueIds.length,
        returned: exercises.length,
      },
    });
  } catch (error) {
    console.error("[Exercise Controller] getExercisesBatch error:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch exercises",
      error: error.message || "Unknown error",
    });
  }
}

module.exports = {
  importExercises,
  getExercises,
  getExerciseById,
  getExercisesBatch,
};
