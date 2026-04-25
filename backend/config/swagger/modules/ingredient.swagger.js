module.exports = {
  "/ingredients": {
    get: {
      tags: ["Ingredients"],
      summary: "Lấy danh sách tất cả nguyên liệu",
      description: "Trả về danh sách tất cả nguyên liệu trong hệ thống",
      responses: {
        200: {
          description: "Danh sách nguyên liệu",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Ingredient" },
              },
            },
          },
        },
      },
    },
    post: {
      tags: ["Ingredients"],
      summary: "Tạo nguyên liệu mới (ADMIN ONLY)",
      description: "Thêm nguyên liệu mới vào hệ thống",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateIngredientRequest",
            },
          },
        },
      },
      responses: {
        201: {
          description: "Nguyên liệu đã được tạo",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Ingredient" },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ",
        },
      },
    },
  },
  "/ingredients/{id}": {
    get: {
      tags: ["Ingredients"],
      summary: "Lấy chi tiết nguyên liệu",
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "ObjectId" },
        },
      ],
      responses: {
        200: {
          description: "Chi tiết nguyên liệu",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Ingredient" },
            },
          },
        },
        404: {
          description: "Nguyên liệu không tồn tại",
        },
      },
    },
    put: {
      tags: ["Ingredients"],
      summary: "Cập nhật nguyên liệu (ADMIN ONLY)",
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "ObjectId" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateIngredientRequest",
            },
          },
        },
      },
      responses: {
        200: {
          description: "Nguyên liệu đã được cập nhật",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Ingredient" },
            },
          },
        },
        404: {
          description: "Nguyên liệu không tồn tại",
        },
      },
    },
    delete: {
      tags: ["Ingredients"],
      summary: "Xóa nguyên liệu (ADMIN ONLY)",
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "ObjectId" },
        },
      ],
      responses: {
        200: {
          description: "Nguyên liệu đã được xóa",
        },
        404: {
          description: "Nguyên liệu không tồn tại",
        },
      },
    },
  },
  "/ingredients/search": {
    get: {
      tags: ["Ingredients"],
      summary: "Tìm kiếm nguyên liệu",
      description: "Tìm kiếm nguyên liệu theo tên hoặc từ khóa",
      parameters: [
        {
          in: "query",
          name: "keyword",
          required: true,
          schema: { type: "string" },
          description: "Từ khóa tìm kiếm",
        },
      ],
      responses: {
        200: {
          description: "Danh sách nguyên liệu tìm được",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Ingredient" },
              },
            },
          },
        },
      },
    },
  },
  "/ingredients/stats": {
    get: {
      tags: ["Ingredients"],
      summary: "Lấy thống kê nguyên liệu (ADMIN ONLY)",
      responses: {
        200: {
          description: "Thống kê nguyên liệu",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  totalIngredients: { type: "number" },
                  byCategory: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/ingredients/check-duplicate": {
    get: {
      tags: ["Ingredients"],
      summary: "Kiểm tra tên nguyên liệu có bị trùng không",
      parameters: [
        {
          in: "query",
          name: "name",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Kết quả kiểm tra",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  duplicate: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  },
};
