module.exports = {
  Recipe: {
    type: "object",
    required: [
      "_id",
      "name",
      "category",
      "servings",
      "totalNutritionPerServing",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      _id: {
        type: "string",
        example: "69c8300f76b416232d5078cd",
      },

      name: {
        type: "string",
        example: "Phở bò tái lăn",
      },

      description: {
        type: "string",
        nullable: true,
      },

      category: {
        type: "string",
        enum: ["one_dish_meal", "main_dish", "side_dish", "dessert", "drink"],
        example: "one_dish_meal",
      },

      source: {
        type: "string",
        enum: ["viendinhduong", "AI_GENERATED", "USER_CREATED", "SYSTEM"],
        example: "viendinhduong",
      },

      sourceMetadata: {
        type: "object",
        nullable: true,
        properties: {
          code: { type: "string", example: "VPF-000274" },
          id: { type: "string", example: "6948c3968d1550cdae0bdcd5" },
        },
      },

      version: {
        type: "number",
        example: 2,
      },

      servings: {
        type: "number",
        example: 1,
      },

      totalWeight: {
        type: "number",
        nullable: true,
      },

      imageUrl: {
        type: "string",
        example: "https://viendinhduong.vn/.../image.webp",
      },

      /* ======================
         INGREDIENTS & STEPS
      ====================== */

      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: "string" },
          },
        },
      },

      instructions: {
        type: "array",
        items: {
          type: "string",
        },
      },

      /* ======================
         NUTRITION
      ====================== */

      totalNutritionPerServing: {
        $ref: "#/components/schemas/Nutrition",
      },

      nutritionVector: {
        type: "array",
        description: "Vector dùng cho search/AI embedding",
        items: {
          type: "number",
        },
        example: [0.93, 2.736, 0.7754, 0.8273, 0.072],
      },

      /* ======================
         TAGS & FLAGS
      ====================== */

      allergy_tags: {
        type: "array",
        items: {
          type: "string",
        },
        example: ["beef"],
      },

      verified: {
        type: "boolean",
        example: true,
      },

      deleted: {
        type: "boolean",
        example: false,
      },

      /* ======================
         SYSTEM
      ====================== */

      createdBy: {
        type: "string",
        example: "admin",
      },

      createdAt: {
        type: "string",
        format: "date-time",
      },

      updatedAt: {
        type: "string",
        format: "date-time",
      },
    },
  },


  RecipeListResponse: {
    type: "object",
    properties: {
      recipes: {
        type: "array",
        items: {
          $ref: "#/components/schemas/Recipe",
        },
      },
      pagination: {
        $ref: "#/components/schemas/PaginationResponse/properties/pagination",
      },
    },
  },

  RecipeDetailResponse: {
    type: "object",
    properties: {
      recipe: {
        $ref: "#/components/schemas/Recipe",
      },
    },
  },

  CreateRecipeRequest: {
    type: "object",
    required: ["name", "ingredients", "instructions"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      imageUrl: { type: "string" },
      cookingTime: { type: "number" },
      servings: { type: "number" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: "string" },
          },
        },
      },
      instructions: {
        type: "array",
        items: { type: "string" },
      },
      tags: {
        type: "array",
        items: { type: "string" },
      },
    },
  },

  UpdateRecipeRequest: {
    allOf: [
      {
        $ref: "#/components/schemas/CreateRecipeRequest",
      },
    ],
  },
};