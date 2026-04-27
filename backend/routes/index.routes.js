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
const mealLogRoutes = require("./mealLog.routes");
const chatRoutes = require("./chat.routes");

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

// Admin only routes
router.use("/audit-logs", auditLogRoutes);
router.use("/admin/dashboard", dashboardRoutes);

// Chat routes
router.use("/chat", chatRoutes);

// Export router tổng
module.exports = router;
