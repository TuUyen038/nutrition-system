const mongoose = require("mongoose");

const recipeItemSchema = new mongoose.Schema(
  {
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },

    // display
    name: { type: String, required: true },
    imageUrl: String,
    description: String,

    // meta (cho logic)
    mealSource: {
      type: String,
      enum: [
        "chicken",
        "pork",
        "beef",
        "seafood",
        "egg",
        "tofu",
        "other",
        "none",
      ],
      default: "none",
    },
    scale: { type: Number, default: 1.0 },
    nutrition: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },
      sugar: { type: Number, default: 0 },
      sodium: { type: Number, default: 0 },
    },
  },
  { _id: false },
);

module.exports = recipeItemSchema;
