const mongoose = require("mongoose");
const recipeItemSchema = require("./subSchemas/RecipeItem");

const dailyMenuSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    date: { type: String, required: true },

    recipes: [
      {
        ...recipeItemSchema.obj,
        servingTime: {
          type: String,
          enum: ["breakfast", "lunch", "dinner", "snack"],
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
    //suggested: danh sách được AI gợi ý (chưa được user chọn)
    //selected: dailtmenu được user chọn -> dại diện cho menu được gợi ý ban đầu chưa được người dùng chỉnh sửa
    //edited: dailymenu từ AI đã được người dùng chọn và chỉnh sửa
    status: {
      type: String,
      enum: [
        "planned",
        "selected",
        "suggested",
        "completed",
        "deleted",
        "edited",
      ],
      default: "planned",
    },
    originalMealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DailyMenu",
      required: false,
    },
    feedback: String,
  },
  { timestamps: true },
);

dailyMenuSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model("DailyMenu", dailyMenuSchema);
