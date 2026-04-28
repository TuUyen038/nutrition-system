const express = require("express");
const router = express.Router();

// Import các router con
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const ingredientRoutes = require("./ingredient.routes");
const nutritionGoalRoutes = require("./nutritionGoal.routes");
const dailyMenuRoutes = require("./dailyMenu.routes");
const mealPlanRoutes = require("./mealPlan.routes");
const recipeRoutes = require("./recipe.routes");
const uploadImageRoutes = require("./uploadImage.routes");
const auditLogRoutes = require("./auditLog.routes");
const favoriteRoutes = require("./favorite.routes");
const dashboardRoutes = require("./dashboard.routes");
const exerciseRoutes = require("./exercise.routes");
const workoutSessionRoutes = require("./workoutSession.routes");
const workoutRoutes = require("./workout.routes");
const workoutPlanRoutes = require("./workoutPlan.routes");
const mealLogRoutes = require("./mealLog.routes");

// Public routes (không cần authentication)
router.use("/auth", authRoutes);
router.use("/exercises", exerciseRoutes);
router.use("/exercise", exerciseRoutes);

// Protected routes (cần authentication)
router.use("/users", userRoutes);
router.use("/ingredients", ingredientRoutes);
router.use("/nutrition-goals", nutritionGoalRoutes);
router.use("/daily-menu", dailyMenuRoutes);
router.use("/meal-plans", mealPlanRoutes);
router.use("/meal-logs", mealLogRoutes);
router.use("/recipes", recipeRoutes);
router.use("/upload-image", uploadImageRoutes);
router.use("/favorites", favoriteRoutes);
router.use("/workout-session", workoutSessionRoutes);
router.use("/workout", workoutRoutes);
router.use("/workout-plan", workoutPlanRoutes);

// Admin only routes
router.use("/audit-logs", auditLogRoutes);
router.use("/admin/dashboard", dashboardRoutes);

// Export router tổng
module.exports = router;
