module.exports = {
  MealRecipe: {
    type: "object",
    properties: {
      name: { type: "string", example: "Chicken Salad" },
      imageUrl: { type: "string", example: "https://img.com/abc.jpg" },
      mealSource: { type: "string", example: "AI_GENERATED" },
      nutrition: {
        $ref: "#/components/schemas/Nutrition",
      },
    },
  },

  MealLogItem: {
    type: "object",
    properties: {
      _id: { type: "string" },
      eatenAt: { type: "string", format: "date-time" },
      recipe: {
        $ref: "#/components/schemas/MealRecipe",
      },
      createdAt: { type: "string", format: "date-time" },
    },
  },

  MealHistoryResponse: {
    type: "object",
    properties: {
      logs: {
        type: "array",
        items: {
          $ref: "#/components/schemas/MealLogItem",
        },
      },
      pagination: {
        type: "object",
        properties: {
          total: { type: "number" },
          page: { type: "number" },
          limit: { type: "number" },
          totalPages: { type: "number" },
        },
      },
    },
  },

  MealStatsResponse: {
    type: "object",
    properties: {
      totalMeals: { type: "number" },
      totalCalories: { type: "number" },
      totalProtein: { type: "number" },
      totalFat: { type: "number" },
      totalCarbs: { type: "number" },
      averagePerDay: { type: "number" },
    },
  },

  DayMealsResponse: {
    type: "object",
    properties: {
      date: { type: "string", example: "2026-04-25" },
      meals: {
        type: "array",
        items: {
          $ref: "#/components/schemas/MealLogItem",
        },
      },
      totalMeals: { type: "number" },
    },
  },

  DeleteMealLogResponse: {
    type: "object",
    properties: {
      message: { type: "string" },
      deletedCount: { type: "number" },
    },
  },
};
