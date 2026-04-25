module.exports = {
  ErrorResponse: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
  },

  SuccessResponse: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      data: {},
    },
  },

  Nutrition: {
    type: "object",
    properties: {
      calories: { type: "number" },
      protein: { type: "number" },
      fat: { type: "number" },
      carbs: { type: "number" },
      fiber: { type: "number" },
      sugar: { type: "number" },
      sodium: { type: "number" },
    },
  },

  RecipeItem: {
    type: "object",
    properties: {
      _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c11" },
      recipeId: {
        type: "object",
        description:
          "Recipe đã populate (hoặc chỉ là ObjectId nếu không populate)",
        properties: {
          _id: { type: "string" },
          name: { type: "string", example: "Bún bò Huế" },
          imageUrl: { type: "string", example: "https://..." },
          description: { type: "string" },
          totalNutrition: { $ref: "#/components/schemas/Nutrition" },
        },
      },
      name: { type: "string", example: "Bún bò Huế" },
      imageUrl: { type: "string", example: "https://..." },
      scale: {
        type: "number",
        description: "Hệ số khẩu phần (1 = 1 serving, 0.5 = nửa phần)",
        example: 1,
      },
      servingTime: {
        type: "string",
        enum: ["breakfast", "lunch", "dinner", "snack", "other"],
        description: "Bữa ăn mà món này thuộc về",
        example: "breakfast",
      },
      nutrition: { $ref: "#/components/schemas/Nutrition" },
      isChecked: {
        type: "boolean",
        description: "User đã ăn món này chưa (dùng để tạo MealLog)",
        example: false,
      },
    },
  },

  NutritionSimple: {
    type: "object",
    description: "Dinh dưỡng cơ bản (4 chỉ số chính)",
    properties: {
      calories: { type: "number", example: 2400 },
      protein: { type: "number", example: 184.1 },
      fat: { type: "number", example: 58.1 },
      carbs: { type: "number", example: 310.6 },
    },
  },

  PaginationResponse: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      data: { type: "array" },
      pagination: {
        type: "object",
        properties: {
          page: { type: "number" },
          limit: { type: "number" },
          total: { type: "number" },
        },
      },
    },
  },
};
