module.exports = {
  Recipe: {
    type: "object",
    properties: {
      _id: {
        type: "string",
        format: "ObjectId",
      },
      name: {
        type: "string",
        example: "Cơm gà Hainanese",
        description: "Tên công thức",
      },
      description: {
        type: "string",
        example: "Cơm gà kiểu Singapore...",
      },
      category: {
        type: "string",
        enum: ["main", "side", "dessert", "drink"],
        example: "main",
      },
      instructions: {
        type: "array",
        items: { type: "string" },
        example: ["Luộc gà", "Xào cơm", "Dựng lên đĩa"],
        description: "Danh sách các bước nấu",
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ingredientId: {
              type: "string",
              format: "ObjectId",
            },
            name: { type: "string" },
            quantity: {
              type: "object",
              properties: {
                amount: { type: "number" },
                unit: {
                  type: "string",
                  enum: ["g", "kg", "l", "ml", "cup", "tbsp", "tsp", "unit"],
                },
              },
            },
          },
        },
      },
      servings: {
        type: "number",
        example: 2,
        description: "Số khẩu phần",
      },
      totalNutrition: {
        $ref: "#/components/schemas/Nutrition",
      },
      imageUrl: {
        type: "string",
        format: "uri",
      },
      createdBy: {
        type: "string",
        enum: ["admin", "user", "ai"],
      },
      verified: {
        type: "boolean",
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
  CreateRecipeRequest: {
    type: "object",
    required: ["name", "ingredients", "instructions"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      category: {
        type: "string",
        enum: ["main", "side", "dessert", "drink"],
      },
      instructions: { type: "array", items: { type: "string" } },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ingredientId: { type: "string" },
            name: { type: "string" },
            quantity: {
              type: "object",
              properties: {
                amount: { type: "number" },
                unit: { type: "string" },
              },
            },
          },
        },
      },
      servings: { type: "number" },
    },
  },
  RecipeStats: {
    type: "object",
    properties: {
      totalRecipes: { type: "number" },
      byCategory: {
        type: "object",
        properties: {
          main: { type: "number" },
          side: { type: "number" },
          dessert: { type: "number" },
          drink: { type: "number" },
        },
      },
    },
  },
  SubstituteIngredient: {
    type: "object",
    properties: {
      _id: {
        type: "string",
        format: "ObjectId",
      },
      name: {
        type: "string",
        example: "Thịt gà",
        description: "Tên nguyên liệu thay thế",
      },
      description: {
        type: "string",
        example: "Có thể thay thế bằng thịt heo",
        description: "Mô tả về sự thay thế",
      },
      nutritionDiff: {
        type: "object",
        description: "Chênh lệch dinh dưỡng so với nguyên liệu gốc",
        properties: {
          calories: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
        },
      },
    },
  },
  NutritionInfo: {
    type: "object",
    properties: {
      calories: { type: "number", example: 500 },
      protein: { type: "number", example: 30 },
      carbs: { type: "number", example: 50 },
      fat: { type: "number", example: 20 },
      fiber: { type: "number", example: 5 },
      sugar: { type: "number", example: 10 },
      sodium: { type: "number", example: 300 },
    },
  },
  RecipeInput: {
    type: "object",
    required: ["name", "ingredients", "instructions"],
    properties: {
      name: {
        type: "string",
        example: "Cơm gà Hainanese",
        description: "Tên công thức",
      },
      description: {
        type: "string",
        example: "Cơm gà kiểu Singapore",
        description: "Mô tả công thức",
      },
      category: {
        type: "string",
        enum: ["main", "side", "dessert", "drink"],
        example: "main",
        description: "Loại món ăn",
      },
      instructions: {
        type: "array",
        items: { type: "string" },
        example: ["Luộc gà", "Xào cơm", "Dựng lên đĩa"],
        description: "Danh sách các bước nấu",
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ingredientId: {
              type: "string",
              format: "ObjectId",
              description: "ID nguyên liệu",
            },
            name: {
              type: "string",
              description: "Tên nguyên liệu",
            },
            quantity: {
              type: "object",
              properties: {
                amount: {
                  type: "number",
                  example: 200,
                  description: "Số lượng",
                },
                unit: {
                  type: "string",
                  enum: ["g", "kg", "l", "ml", "cup", "tbsp", "tsp", "unit"],
                  example: "g",
                  description: "Đơn vị",
                },
              },
            },
          },
        },
      },
      servings: {
        type: "number",
        example: 2,
        description: "Số khẩu phần",
      },
      imageUrl: {
        type: "string",
        format: "uri",
        example: "https://example.com/image.jpg",
        description: "URL hình ảnh món ăn",
      },
    },
  },
};
