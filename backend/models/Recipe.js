const mongoose = require("mongoose");

const recipeSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    name: { type: String, required: true, trim: true },
    totalWeight: Number,
    source: {
      type: String,
      index: true,
    },
    sourceMetadata: {
      code: { type: String, sparse: true, index: true },
      id: { type: String, sparse: true, index: true },
    },

    version: {
      type: Number,
      required: true,
      default: 2,
      index: true,
    },

    description: { type: String, trim: true },
    category: {
      type: String,
      enum: [
        "main",             // Món chính
        "side",             // Món phụ
        "dessert",          // Món tráng miệng
        "drink",            // Đồ uống
        "base_starch",      // Tinh bột cơ bản (bún, cơm lứt...)
        "light_supplement", // Bổ sung nhẹ (phô mai, hạt...)
        "one_dish_meal",    // Món ăn một món (phở, hủ tiếu...)
        "soup_veg",         // Canh rau
      ],
    },
    allergy_tags: [String],

    instructions: [String],
    ingredients: [
      {
        ingredientId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ingredient",
        },
        quantity: {
          amount: { type: Number },
          unit: {
            type: String,
            enum: ["g"],
          },
          originalAmount: Number,
          originalUnit: String,
        },
        note: String,
        name: { type: String, required: true, trim: true },
        rawName: String,
      },
    ],

    servings: { type: Number },

    totalNutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },

    totalNutritionPerServing: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },

    totalNutritionPer100g: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },

    imageUrl: String,
    public_id: String,
    createdBy: {
      type: String,
      enum: ["admin", "user", "ai"],
      default: "admin",
    },
    verified: { type: Boolean, default: true },
    // isPublic: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }, // Soft delete
    nutritionVector: [Number],
  },
  { timestamps: true },
);

recipeSchema.index({ name: "text" }); // Index dạng text cho tìm kiếm toàn văn (nếu cần)
recipeSchema.index({ ownerId: 1 }); // Index đơn giản cho tìm kiếm theo ID
recipeSchema.index({ category: 1 }); // Index đơn giản cho bộ lọc danh mục
recipeSchema.index({ "ingredients.ingredientId": 1 });

module.exports = mongoose.model("Recipe", recipeSchema);
