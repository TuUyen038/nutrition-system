module.exports = {
  "/workout-plan/current": {
    get: {
      tags: ["Workout Plan"],
      summary: "Lấy kế hoạch tập luyện hiện tại (30 ngày)",
      description: "Lấy kế hoạch tập luyện 30 ngày của user. Nếu chưa có sẽ tự động tạo mới. User hoàn thành tới đâu sẽ tiến tới ngày tiếp theo.",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Lấy kế hoạch thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      userId: { type: "string" },
                      workoutLevel: { type: "string", example: "beginner" },
                      targetCalories: { type: "number", example: 200 },
                      currentDay: { type: "number", example: 5 },
                      plan: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            day: { type: "number", example: 1, minimum: 1, maximum: 30 },
                            type: { type: "string", example: "workout" },
                            exerciseDetails: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  exerciseId: { type: "number" },
                                  name: { type: "string", example: "Push-up" },
                                  duration: { type: "number", example: 15 },
                                  calories: { type: "number", example: 50 },
                                  sets: { type: "number", example: 3 },
                                  reps: { type: "string", example: "10-12" },
                                },
                              },
                            },
                            muscleGroup: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "number" },
                                  name: { type: "string" },
                                  name_en: { type: "string" },
                                },
                              },
                              description: "Các nhóm cơ chính từ tất cả bài tập trong ngày",
                            },
                            totalDuration: { type: "number", example: 30 },
                            totalCalories: { type: "number", example: 200 },
                            completed: { type: "boolean", example: false },
                            completedAt: { type: "string", format: "date-time" },
                          },
                        },
                      },
                      generatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },

  "/workout-plan/current/detailed": {
    get: {
      tags: ["Workout Plan"],
      summary: "Lấy kế hoạch tập luyện với đầy đủ chi tiết bài tập",
      description: "Lấy kế hoạch tập luyện 30 ngày với thông tin chi tiết từng bài tập (tên, hình ảnh, mô tả). Tối ưu hóa: một query lấy tất cả exercise.",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Lấy kế hoạch chi tiết thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      userId: { type: "string" },
                      workoutLevel: { type: "string", example: "beginner" },
                      targetCalories: { type: "number", example: 200 },
                      currentDay: { type: "number", example: 5 },
                      plan: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            day: { type: "number", example: 1, minimum: 1, maximum: 30 },
                            type: { type: "string", example: "workout" },
                            exerciseDetails: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  exerciseId: { type: "number" },
                                  name: { type: "string", example: "Push-up" },
                                  duration: { type: "number", example: 15 },
                                  calories: { type: "number", example: 50 },
                                  sets: { type: "number", example: 3 },
                                  reps: { type: "string", example: "10-12" },
                                },
                              },
                            },
                            muscleGroup: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "number" },
                                  name: { type: "string" },
                                  name_en: { type: "string" },
                                },
                              },
                              description: "Các nhóm cơ chính từ tất cả bài tập trong ngày",
                            },
                            totalDuration: { type: "number", example: 30 },
                            totalCalories: { type: "number", example: 200 },
                            completed: { type: "boolean", example: false },
                            completedAt: { type: "string", format: "date-time" },
                          },
                        },
                      },
                      generatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },

  "/workout-plan/generate": {
    post: {
      tags: ["Workout Plan"],
      summary: "Tạo kế hoạch tập luyện 30 ngày mới",
      description: "Generate workout plan 30 days for user",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Tạo kế hoạch thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Workout plan generated successfully" },
                  data: { type: "object" },
                },
              },
            },
          },
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },

  "/workout-plan/regenerate": {
    post: {
      tags: ["Workout Plan"],
      summary: "Tạo lại kế hoạch tập luyện",
      description: "Xóa kế hoạch cũ và tạo kế hoạch mới",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Tạo lại kế hoạch thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Workout plan regenerated successfully" },
                  data: { type: "object" },
                },
              },
            },
          },
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },

  "/workout-plan/complete": {
    patch: {
      tags: ["Workout Plan"],
      summary: "Hoàn thành buổi tập tiếp theo",
      description:
        "Đánh dấu ngày chưa hoàn thành tiếp theo là hoàn thành và tạo WorkoutSession tương ứng",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Complete success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Workout session saved" },
                  data: {
                    type: "object",
                    properties: {
                      completedDay: { type: "number", example: 5 },
                      completedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  "/workout-plan/stats": {
    get: {
      tags: ["Workout Plan"],
      summary: "Lấy thống kê tập luyện",
      description: "Lấy thống kê tiến độ tập luyện của user",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Lấy thống kê thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      totalDays: { type: "number", example: 30 },
                      completedDays: { type: "number", example: 3 },
                      totalCalories: { type: "number", example: 600 },
                      completionRate: { type: "number", example: 60 },
                    },
                  },
                },
              },
            },
          },
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },
};