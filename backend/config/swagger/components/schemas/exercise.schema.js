module.exports = {
  Exercise: {
    type: "object",
    properties: {
      exerciseId: {
        type: "number",
        example: 123,
        description: "ID bài tập",
      },
      name: {
        type: "string",
        example: "Chạy bộ",
        description: "Tên bài tập",
      },
      description: {
        type: "string",
        example: "Chạy 5km",
      },
      categoryId: {
        type: "number",
        nullable: true,
        example: 10,
        description: "ID category từ nguồn",
      },
      category: {
        type: "string",
        example: "Cardio",
      },
      muscles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string" },
            name_en: { type: "string" },
          },
        },
      },
      muscles_secondary: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string" },
            name_en: { type: "string" },
          },
        },
      },
      equipment: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string" },
          },
        },
      },
      images: {
        type: "array",
        items: { type: "string", format: "uri" },
      },
      videos: {
        type: "array",
        items: { type: "string", format: "uri" },
      },
      activityType: {
        type: "string",
        enum: [
          "strength_training",
          "calisthenics",
          "cardio_machine",
          "hiit",
          "aerobic_dance",
          "yoga_stretching",
          "functional_training",
        ],
        example: "strength_training",
        description: "Loại hoạt động",
      },
      defaultIntensity: {
        type: "string",
        enum: ["light", "moderate", "vigorous"],
        example: "moderate",
        description: "Cường độ mặc định",
      },
    },
  },
};
