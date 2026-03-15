const express = require("express");
const router = express.Router();
const exerciseController = require("../controllers/exercise.controller");

router.post("/import", exerciseController.importExercises);
router.get("/", exerciseController.getExercises); // filter by categoryId, muscleIds, equipmentIds via query params
router.get("/:id", exerciseController.getExerciseById);

module.exports = router;
