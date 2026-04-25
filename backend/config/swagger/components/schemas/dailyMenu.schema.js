module.exports = {
  DailyMenu: {
    type: "object",
    properties: {
      _id: { type: "string", format: "ObjectId" },
      userId: { type: "string", format: "ObjectId" },

      date: {
        type: "string",
        format: "date",
        example: "2025-02-13",
      },

      recipes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            _id: { type: "string", format: "ObjectId" },

            recipeId: { type: "string", format: "ObjectId" },

            name: { type: "string" },
            imageUrl: { type: "string" },
            description: { type: "string" },

            mealSource: {
              type: "string",
              enum: [
                "chicken",
                "pork",
                "beef",
                "seafood",
                "egg",
                "tofu",
                "other",
                "pho",
                "bun",
                "mi",
                "none",
              ],
            },

            scale: { type: "number", example: 1 },

            nutrition: {
              $ref: "#/components/schemas/Nutrition",
            },

            servingTime: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "snack", "other"],
            },

            isChecked: { type: "boolean" },
          },
        },
      },

      totalNutrition: {
        $ref: "#/components/schemas/Nutrition",
      },

      targetNutrition: {
        $ref: "#/components/schemas/Nutrition",
      },

      status: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
      },

      feedback: { type: "string" },

      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  CreateDailyMenuRequest: {
    type: "object",
    required: ["date"],
    properties: {
      date: {
        type: "string",
        format: "date",
        example: "2025-02-13",
      },
      recipes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recipeId: { type: "string" },
            portion: { type: "number" },
            servingTime: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "other"],
            },
            note: { type: "string" },
          },
        },
      },
    },
  },
  AddRecipeRequest: {
    type: "object",
    required: ["date", "recipeId"],
    properties: {
      date: {
        type: "string",
        format: "date",
        example: "2025-02-13",
      },

      dailyMenuId: {
        type: "string",
        format: "ObjectId",
      },

      recipeId: {
        type: "string",
        format: "ObjectId",
      },

      scale: {
        type: "number",
        default: 1,
      },

      servingTime: {
        type: "string",
        enum: ["breakfast", "lunch", "dinner", "snack", "other"],
        default: "other",
      },
    },
  },
  UpdateRecipeRequest: {
    type: "object",
    required: ["date", "dailyMenuId", "recipeItemId"],
    properties: {
      date: { type: "string", format: "date" },
      dailyMenuId: { type: "string", format: "ObjectId" },
      recipeItemId: { type: "string", format: "ObjectId" },

      newScale: {
        type: "number",
        minimum: 0,
      },

      checked: {
        type: "boolean",
      },
    },
  },
  DeleteRecipeRequest: {
    type: "object",
    required: ["dailyMenuId", "recipeItemId"],
    properties: {
      dailyMenuId: {
        type: "string",
        format: "ObjectId",
        description: "ID của daily menu",
      },
      recipeItemId: {
        type: "string",
        format: "ObjectId",
        description: "ID của món ăn trong menu cần xóa",
      },
    },
  },
  UpdateStatusRequest: {
    type: "object",
    required: ["dailyMenuId", "newStatus"],
    properties: {
      dailyMenuId: {
        type: "string",
        format: "ObjectId",
        description: "ID của daily menu",
      },
      newStatus: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
        description: "Trạng thái mới của thực đơn",
      },
    },
  },
  CreateDailyMenuV2Request: {
    type: "object",
    required: ["date"],
    properties: {
      date: {
        type: "string",
        format: "date",
        example: "2025-02-13",
        description: "Ngày cần tạo menu theo định dạng YYYY-MM-DD",
      },
    },
  },
};
