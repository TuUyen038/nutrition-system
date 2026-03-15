const exerciseService = require("../services/exercise.service");

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
    console.error("[Exercise Controller] getExercises error", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to fetch exercises", error: error.message || "Unknown error" });
  }
}

module.exports = {
  importExercises,
  getExercises,
  getExerciseById,
};
