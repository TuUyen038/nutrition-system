module.exports = {
  "/meal-logs": {
  get: {
    tags: ["MealLogs"],
    summary: "Lấy lịch sử ăn uống",
    description: "Lấy danh sách meal logs theo khoảng thời gian (days) với phân trang",
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "days",
        in: "query",
        schema: { type: "number", example: 7 },
      },
      {
        name: "page",
        in: "query",
        schema: { type: "number", example: 1 },
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "number", example: 20 },
      },
    ],
    responses: {
      200: {
        description: "Lấy lịch sử thành công",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: {
                  $ref: "#/components/schemas/MealHistoryResponse",
                },
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
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },
  },
},
}