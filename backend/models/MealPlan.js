const mongoose = require("mongoose");

const mealPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // // "day" hoặc "week"
    // period: {
    //   type: String,
    //   enum: ["day", "week"],
    //   default: "week"
    // },

    startDate: { type: Date, required: true },
    endDate: { type: Date },

    // Các meal cụ thể trong giai đoạn này
    dailyMenuIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "DailyMenu" }],

    // Nguồn tạo ra plan
    source: {
      type: String,
      enum: ["ai", "user"],
    },

    generatedBy: { type: String },

    status: {
      type: String,
      enum: [
        "manual",
        "suggested",
        "selected",
        "completed",
        "deleted",
        "expired",
      ],
      default: "suggested",
    },
    weeklyTotalNutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },
    weeklyAverageNutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },
  },
  { timestamps: true },
);

// Query nhanh plan theo user và thời gian
mealPlanSchema.index({ userId: 1, startDate: -1 });

module.exports = mongoose.model("MealPlan", mealPlanSchema);
