const mongoose = require("mongoose");
const { act } = require("react");

const nutritionGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    bodySnapshot: {
      age: Number,
      gender: String,
      height: Number,
      weight: Number,
      goal: String,
      activityFactor: Number,
    },

    // Kết quả tính toán
    targetNutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },

    tdee: {
      calories: Number,
      brm: Number,
      activityFactor: Number,
    },

    // Trạng thái version
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Chu kỳ áp dụng
    period: {
      type: String,
      enum: ["day", "week", "month", "custom"],
      default: "day",
    },

    periodValue: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NutritionGoal", nutritionGoalSchema);