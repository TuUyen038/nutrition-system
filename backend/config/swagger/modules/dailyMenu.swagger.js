module.exports = {
  "/daily-menu/add-recipe": {
    post: {
      tags: ["Daily Menu"],
      summary: "Thêm công thức vào thực đơn hàng ngày",
      description: "Thêm một công thức vào thực đơn hàng ngày của người dùng. Nếu chưa có dailymenu của ngày đó thì tự động tạo dailymenu rồi add món ăn vào, sau đó tự cập nhật nutrition mới.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/AddRecipeRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Thêm món ăn thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/daily-menu/update-status": {
    patch: {
      tags: ["Daily Menu"],
      summary: "Cập nhật trạng thái dailymenu",
      description:
        "Cập nhật trạng thái của thực đơn hàng ngày (manual, suggested, selected, completed, deleted, expired). KHÔNG thể cập nhật các dailymenu đang có trạng thái là deleted",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateStatusRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Cập nhật trạng thái thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/daily-menu/update-recipe": {
    patch: {
      tags: ["Daily Menu"],
      summary: "Cập nhật món ăn trong thực đơn",
      description:
        "Cập nhật thông tin món ăn (scale: tỉ lệ so với khẩu phần 1 người chuẩn, trạng thái checked) trong thực đơn hàng ngày",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateRecipeRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Cập nhật món ăn thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/daily-menu/delete-recipe": {
    delete: {
      tags: ["Daily Menu"],
      summary: "Xóa món ăn khỏi thực đơn",
      description: "Xóa một món ăn khỏi thực đơn hàng ngày",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DeleteRecipeRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Xóa món ăn thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/daily-menu/recommendations/day": {
    post: {
      tags: ["Daily Menu"],
      summary: "Gợi ý thực đơn hàng ngày",
      description:
        "Sử dụng AI để gợi ý thực đơn hàng ngày dựa trên mục tiêu dinh dưỡng và sở thích của người dùng",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateDailyMenuV2Request",
            },
          },
        },
      },
      responses: {
        200: {
          description: "Gợi ý thực đơn thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
        400: {
          description: "Lỗi khi gợi ý thực đơn",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/daily-menu/by-date": {
    get: {
      tags: ["Daily Menu"],
      summary: "Lấy thực đơn theo ngày",
      description: "Lấy thực đơn (chỉ lấy các thực đơn có status là \"manual\" hoặc \"selected\") của người dùng theo một ngày cụ thể",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "date",
          required: true,
          schema: {
            type: "string",
            format: "date",
            example: "2025-02-13",
          },
          description: "Ngày cần lấy thực đơn (YYYY-MM-DD)",
        },
      ],
      responses: {
        200: {
          description: "Lấy thực đơn thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Lấy thực đơn theo ngày thành công",
                  },
                  data: {
                    $ref: "#/components/schemas/DailyMenu",
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Lỗi khi lấy thực đơn",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/daily-menu/by-range": {
    get: {
      tags: ["Daily Menu"],
      summary: "Lấy danh sách thực đơn theo khoảng ngày",
      description:
        "Lấy danh sách thực đơn của người dùng trong khoảng ngày (chỉ lấy các dailymenu có status là \"manual\" hoặc \"selected\") ",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "startDate",
          required: true,
          schema: {
            type: "string",
            format: "date",
            example: "2025-02-01",
          },
          description: "Ngày bắt đầu (YYYY-MM-DD)",
        },
        {
          in: "query",
          name: "endDate",
          required: true,
          schema: {
            type: "string",
            format: "date",
            example: "2025-02-07",
          },
          description: "Ngày kết thúc (YYYY-MM-DD)",
        },
      ],
      responses: {
        200: {
          description: "Lấy danh sách thực đơn thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Lấy danh sách thực đơn thành công",
                  },
                  data: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/DailyMenu",
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Lỗi khi lấy danh sách thực đơn",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
};
