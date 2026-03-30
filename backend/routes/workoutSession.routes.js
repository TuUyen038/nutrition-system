const express = require("express");
const router = express.Router();

const {
  startWorkout,
  stopWorkout,
  getTodayKcal,
} = require("../controllers/workoutSession.controller");

const { authenticate } = require("../middlewares/auth");

// All routes require authentication
router.use(authenticate);

router.post("/start", startWorkout);
router.post("/stop", stopWorkout);
router.get("/today-kcal", getTodayKcal);

module.exports = router;