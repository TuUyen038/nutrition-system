module.exports = {
  Ingredient: {
    type: "object",
    properties: {
      _id: {
        type: "string",
        format: "ObjectId",
      },
      name: {
        type: "string",
        example: "Gà ngon",
        description: "Tên nguyên liệu (tiếng Việt)",
      },
      name_en: {
        type: "string",
        example: "chicken",
        description: "Tên tiếng Anh",
      },
      nutrition: {
        type: "object",
        properties: {
          calories: { type: "number", description: "Calo" },
          protein: { type: "number", description: "Protein (g)" },
          fat: { type: "number", description: "Chất béo (g)" },
          carbs: { type: "number", description: "Carbs (g)" },
          fiber: { type: "number", description: "Chất xơ (g)" },
          sugar: { type: "number", description: "Đường (g)" },
          sodium: { type: "number", description: "Natrium (mg)" },
        },
      },
      unit: {
        type: "string",
        example: "g",
        description: "Đơn vị cơ bản (g, kg, ml, l, cup...)",
      },
      category: {
        type: "string",
        enum: [
          "protein",
          "carb",
          "fat",
          "vegetable",
          "fruit",
          "dairy",
          "seasoning",
          "beverage",
          "other",
        ],
        example: "protein",
      },
      aliases: {
        type: "array",
        items: { type: "string" },
        example: ["gà", "thịt gà", "chicken breast"],
        description: "Các tên gọi khác",
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
  CreateIngredientRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: {
        type: "string",
        example: "Gà ngon",
      },
      name_en: {
        type: "string",
        example: "chicken",
      },
      nutrition: {
        $ref: "#/components/schemas/Nutrition",
      },
      unit: {
        type: "string",
        default: "g",
      },
      category: {
        type: "string",
        enum: [
          "protein",
          "carb",
          "fat",
          "vegetable",
          "fruit",
          "dairy",
          "seasoning",
          "beverage",
          "other",
        ],
      },
      aliases: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
};
