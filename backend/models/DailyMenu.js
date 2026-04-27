const mongoose = require("mongoose");
const recipeItemSchema = require("./subSchemas/RecipeItem");

const dailyMenuSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    date: { type: Date, required: true },

    recipes: [
      {
        ...recipeItemSchema.obj,
        servingTime: {
          type: String,
          enum: ["breakfast", "lunch", "dinner", "snack", "other"],
          default: "other",
        },
        isChecked: Boolean,
      },
    ],

    totalNutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },

    targetNutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },
    //suggested: danh sách được gợi ý TUY NHIÊN chưa đc user chọn
    //selected: suggested được người dùng chọn
    //expired: suggested nhưng hết hạn
    //hiện tại, các status sẽ được hiển thị khi dùng hàm get dailymenu chính là manual và selected
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
      default: "manual",
    },
    feedback: String,
  },
  { timestamps: true },
);

dailyMenuSchema.index({ userId: 1, status: 1, date: -1 });

module.exports = mongoose.model("DailyMenu", dailyMenuSchema);
