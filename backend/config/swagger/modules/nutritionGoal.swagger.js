module.exports = {
  "/nutrition-goals": {
    get: {
      tags: ["Nutrition Goals"],
      summary: "Lấy danh sách mục tiêu dinh dưỡng",
      description: "Lấy tất cả mục tiêu dinh dưỡng của người dùng hiện tại",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Danh sách mục tiêu",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/NutritionGoal" },
              },
            },
          },
        },
        401: {
          description: "Chưa xác thực",
        },
      },
    },
  },
  "/nutrition-goals/active": {
    get: {
      tags: ["Nutrition Goals"],
      summary: "Lấy mục tiêu dinh dưỡng hiện tại",
      description: "Lấy mục tiêu dinh dưỡng đang hoạt động",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Mục tiêu dinh dưỡng hiện tại",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NutritionGoal" },
            },
          },
        },
        404: {
          description: "Không có mục tiêu nào đang hoạt động",
        },
      },
    },
  },
};
