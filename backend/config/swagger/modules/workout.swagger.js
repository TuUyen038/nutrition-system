module.exports = {
  "/workout/plan": {
    get: {
      tags: ["Workout"],
      summary: "Tạo workout plan cho user",
      description: "Generate workout plan dựa trên thông tin user (fitness level, goal,...)",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Workout plan được tạo thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    description: "Workout plan (tùy theo logic service)",
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

  "/workout/level": {
    get: {
      tags: ["Workout"],
      summary: "Lấy cấp độ tập luyện của user",
      description: "Trả về workout level dựa trên fitnessLevel của user",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Lấy workout level thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      fitnessLevel: { type: "string", example: "beginner" },
                      workoutLevel: { type: "string", example: "easy" },
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
        404: {
          description: "User không tồn tại",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },
};