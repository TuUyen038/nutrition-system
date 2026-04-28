module.exports = {
  "/exercises/import": {
    post: {
      tags: ["Exercise"],
      summary: "Import exercises từ Wger API",
      description: "Lấy dữ liệu bài tập từ Wger và lưu vào hệ thống",
      responses: {
        201: {
          description: "Import thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Exercises imported successfully" },
                  data: {
                    type: "object",
                    description: "Kết quả import (số lượng, danh sách...)",
                    properties: {
                      count: { type: "number", example: 50 },
                      imported: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Yêu cầu không hợp lệ",
        },
        500: {
          description: "Lỗi server",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Failed to import exercises" },
                  error: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },

  "/exercises": {
    get: {
      tags: ["Exercise"],
      summary: "Lấy danh sách exercise (có filter)",
      description: "Lấy danh sách bài tập theo category, muscle, equipment",
      parameters: [
        {
          in: "query",
          name: "categoryId",
          schema: { type: "string" },
          example: "10",
          description: "ID của category (vd: 10 = Cardio)",
        },
        {
          in: "query",
          name: "muscleIds",
          schema: { type: "string" },
          example: "1,2,3",
          description: "Danh sách muscleId (comma-separated)",
        },
        {
          in: "query",
          name: "equipmentIds",
          schema: { type: "string" },
          example: "4,5",
          description: "Danh sách equipmentId (comma-separated)",
        },
      ],
      responses: {
        200: {
          description: "Danh sách exercise",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Exercise",
                },
              },
              example: [
                {
                  exerciseId: 101,
                  name: "Push-up",
                  description: "Basic push-up exercise",
                  categoryId: 8,
                  category: "Strength",
                  muscles: [
                    { id: 1, name: "Chest", name_en: "Chest" }
                  ],
                  muscles_secondary: [
                    { id: 2, name: "Triceps", name_en: "Triceps" }
                  ],
                  equipment: [
                    { id: 1, name: "Bodyweight" }
                  ],
                  images: [],
                  videos: [],
                  activityType: "strength_training",
                },
              ],
            },
          },
        },
        500: {
          description: "Lỗi server",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Failed to fetch exercises" },
                  error: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },

  "/exercises/{id}": {
    get: {
      tags: ["Exercise"],
      summary: "Lấy chi tiết exercise theo ID",
      description: "Lấy thông tin chi tiết của một bài tập",
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "number" },
          example: 101,
          description: "ID của exercise",
        },
      ],
      responses: {
        200: {
          description: "Thông tin exercise",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Exercise",
              },
              example: {
                exerciseId: 101,
                name: "Push-up",
                description: "Basic push-up exercise",
                categoryId: 8,
                category: "Strength",
                muscles: [
                  { id: 1, name: "Chest", name_en: "Chest" }
                ],
                muscles_secondary: [
                  { id: 2, name: "Triceps", name_en: "Triceps" }
                ],
                equipment: [
                  { id: 1, name: "Bodyweight" }
                ],
                images: ["https://wger.de/media/exercise/101/medium.jpg"],
                videos: [],
                activityType: "strength_training",
              },
            },
          },
        },
        400: {
          description: "ID không hợp lệ",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Invalid exercise ID" },
                },
              },
            },
          },
        },
        404: {
          description: "Không tìm thấy exercise",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Exercise not found" },
                },
              },
            },
          },
        },
        500: {
          description: "Lỗi server",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Failed to fetch exercise" },
                  error: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },

  "/exercises/batch": {
    post: {
      tags: ["Exercise"],
      summary: "Lấy danh sách bài tập theo IDs",
      description: "Batch fetch exercises bằng danh sách IDs (tối đa 100 IDs, tự động deduplicate)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ids"],
              properties: {
                ids: {
                  type: "array",
                  items: { type: "number" },
                  example: [1, 2, 3, 4, 5],
                  description: "Danh sách exercise IDs",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Lấy danh sách bài tập thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Exercise" },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Invalid request data" },
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