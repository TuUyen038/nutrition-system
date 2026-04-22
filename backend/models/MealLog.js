const mongoose = require("mongoose");
const recipeItemSchema = require("./subSchemas/RecipeItem");

const mealLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

  // thời điểm ăn (không chỉ date)
  eatenAt: { type: Date, required: true, index: true },

  // link với plan (nếu có)
  dailyMenuId: { type: mongoose.Schema.Types.ObjectId },

  recipe: recipeItemSchema,
  
  source: {
    type: String,
    enum: ["planned", "manual"],
    default: "planned"
  },

}, { timestamps: true });

mealLogSchema.index({ userId: 1, eatenAt: -1 });

module.exports = mongoose.model("MealLog", mealLogSchema);