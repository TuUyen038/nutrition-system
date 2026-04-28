const express = require("express");
const router = express.Router();

const {
  startWorkout,
  stopWorkout,
  completeWorkout,
  getTodayKcal,
} = require("../controllers/workoutSession.controller");

const { authenticate } = require("../middlewares/auth");

// All routes require authentication
router.use(authenticate);

router.post("/start", startWorkout);
router.post("/stop", stopWorkout);
router.post("/complete", completeWorkout); // Alias for stop - calculates calories
router.get("/today-kcal", getTodayKcal);

module.exports = router;