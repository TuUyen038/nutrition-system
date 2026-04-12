const express = require("express");
const router = express.Router();

const {
  generateWorkoutPlan,
  getWorkoutLevel,
} = require("../controllers/workout.controller");

const { authenticate } = require("../middlewares/auth");

// All routes require authentication
router.use(authenticate);

router.get("/plan", generateWorkoutPlan);
router.get("/level", getWorkoutLevel);

module.exports = router;