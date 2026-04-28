module.exports = {
  "/workout-session/start": {
    post: {
      tags: ["Workout Session"],
      summary: "Bắt đầu buổi tập",
      description: "Tạo session workout mới",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userId", "exerciseId", "intensity"],
              properties: {
                userId: { type: "string", example: "507f1f77bcf86cd799439011" },
                exerciseId: { type: "string", example: "101" },
                intensity: { type: "string", enum: ["low", "medium", "high"], example: "medium" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Bắt đầu workout thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string", example: "session123" },
                      userId: { type: "string" },
                      exerciseId: { type: "string" },
                      startTime: { type: "string", format: "date-time" },
                      intensity: { type: "string" },
                      status: { type: "string", example: "in_progress" },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
      },
    },
  },

  "/workout-session/stop": {
    post: {
      tags: ["Workout Session"],
      summary: "Kết thúc buổi tập",
      description: "Stop workout session và tính toán calories",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["sessionId"],
              properties: {
                sessionId: { type: "string", example: "507f1f77bcf86cd799439011" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Kết thúc workout thành công",
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
                      exerciseId: { type: "string" },
                      startTime: { type: "string", format: "date-time" },
                      endTime: { type: "string", format: "date-time" },
                      duration: { type: "number", description: "Thời gian tập (phút)" },
                      caloriesBurned: { type: "number", description: "Calories đốt cháy" },
                      status: { type: "string", example: "completed" },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Session không hợp lệ",
        },
        401: {
          description: "Unauthorized - Token không hợp lệ",
        },
        404: {
          description: "Không tìm thấy session",
        },
      },
    },
  },

  "/workout-session/today-kcal": {
    get: {
      tags: ["Workout Session"],
      summary: "Lấy lượng calories hôm nay",
      description: "Tổng kcal user đã đốt trong ngày",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "userId",
          required: true,
          schema: {
            type: "string",
          },
          example: "507f1f77bcf86cd799439011",
        },
      ],
      responses: {
        200: {
          description: "Lấy kcal thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      totalKcal: { type: "number", example: 350 },
                      sessions: { type: "array", items: { type: "object" } },
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