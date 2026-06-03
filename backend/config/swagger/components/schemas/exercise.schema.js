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
      difficulty: {
        type: "string",
        enum: ["beginner", "intermediate", "advanced"],
        example: "beginner",
        description: "Độ khó bài tập",
      },
      exerciseType: {
        type: "string",
        enum: [
          "compound",
          "isolation",
          "cardio",
          "mobility",
          "stretching",
        ],
        example: "compound",
        description: "Loại bài tập",
      },
      impactLevel: {
        type: "string",
        enum: ["low", "medium", "high"],
        example: "medium",
        description: "Mức độ tác động lên khớp/cơ thể",
      },
      fatigueScore: {
        type: "number",
        example: 7,
        description: "Mức độ gây mệt mỏi (1-10)",
      },
      suitableGoals: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "lose_weight",
            "maintain_weight",
            "gain_weight",
            "endurance",
            "strength",
            "mobility",
          ],
        },
        example: ["lose_weight", "strength"],
        description: "Mục tiêu phù hợp với bài tập",
      },
      avoidFor: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "knee_pain",
            "lower_back_pain",
            "shoulder_pain",
            "obesity",
          ],
        },
        example: ["lower_back_pain"],
        description: "Các trường hợp nên tránh bài tập này",
      },
    },
  },
};
