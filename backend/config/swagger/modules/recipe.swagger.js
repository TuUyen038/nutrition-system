module.exports = {
  /* =======================
     SEARCH / PUBLIC
  ======================= */

  "/recipes/": {
    get: {
      tags: ["Recipes"],
      summary: "Lấy danh sách các món ăn kết hợp Tìm kiếm recipes theo tên",
      parameters: [
        { name: "name", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "number", example: 1 } },
        { name: "limit", in: "query", schema: { type: "number", example: 10 } },
      ],
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/SuccessResponse" },
                  {
                    properties: {
                      data: {
                        $ref: "#/components/schemas/RecipeListResponse",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  },

  "/recipes/search/by-ingredient": {
    get: {
      tags: ["Recipes"],
      summary: "Tìm theo nguyên liệu",
      parameters: [
        {
          name: "keyword",
          in: "query",
          schema: { type: "string" },
        },
      ],
      responses: { 200: { description: "Success" } },
    },
  },

  "/recipes/search/by-name": {
    get: {
      tags: ["Recipes"],
      summary: "Tìm theo tên món",
      parameters: [
        {
          name: "name",
          in: "query",
          schema: { type: "string" },
        },
      ],
      responses: { 200: { description: "Success" } },
    },
  },

  "/recipes/stats": {
    get: {
      tags: ["Recipes"],
      summary: "Thống kê recipes",
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/SuccessResponse" },
                  {
                    properties: {
                      data: {
                        $ref: "#/components/schemas/RecipeStatsResponse",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  },

  "/recipes/validate/duplicate-name": {
    get: {
      tags: ["Recipes"],
      summary: "Kiểm tra tên recipe bị trùng",
      parameters: [
        {
          name: "name",
          in: "query",
          schema: { type: "string" },
        },
      ],
      responses: { 200: { description: "OK" } },
    },
  },

  "/recipes/{id}": {
    get: {
      tags: ["Recipes"],
      summary: "Lấy chi tiết recipe",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/SuccessResponse" },
                  {
                    properties: {
                      data: {
                        $ref: "#/components/schemas/RecipeDetailResponse",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },

    put: {
      tags: ["Recipes"],
      summary: "Cập nhật recipe",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UpdateRecipeRequest",
            },
          },
        },
      },
      responses: { 200: { description: "Updated" } },
    },

    delete: {
      tags: ["Recipes"],
      summary: "Xoá recipe",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: { 200: { description: "Deleted" } },
    },
  },

  /* =======================
     AI FEATURES
  ======================= */

  "/recipes/ai/search-by-image": {
    post: {
      tags: ["Recipes"],
      summary: "Tìm recipe bằng ảnh",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                foodImage: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Success" } },
    },
  },

  "/recipes/ai/detect-food": {
    post: {
      tags: ["Recipes"],
      summary: "Nhận diện món ăn từ ảnh",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                foodImage: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Detected" } },
    },
  },

  "/recipes/ai/extract-ingredients": {
    post: {
      tags: ["Recipes"],
      summary: "AI trích xuất nguyên liệu",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                text: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Extracted" } },
    },
  },

  "/recipes/ai/recommendations/{foodName}": {
    get: {
      tags: ["Recipes"],
      summary: "AI gợi ý nguyên liệu & cách nấu",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "foodName",
          in: "path",
          schema: { type: "string" },
        },
      ],
      responses: { 200: { description: "Success" } },
    },
  },

  /* =======================
     NUTRITION
  ======================= */

  "/recipes/nutrition/fallback": {
    post: {
      tags: ["Recipes"],
      summary: "Lấy nutrition fallback",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Success" } },
    },
  },

  /* =======================
     INGREDIENT UTILS
  ======================= */

  // "/recipes/ingredients/substitutions": {
  //   post: {
  //     tags: ["Recipes"],
  //     summary: "Gợi ý thay thế nguyên liệu",
  //     security: [{ bearerAuth: [] }],
  //     responses: { 200: { description: "Success" } },
  //   },
  // },

  /* =======================
     ADMIN
  ======================= */

  "/recipes": {
    post: {
      tags: ["Recipes"],
      summary: "Tạo recipe",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateRecipeRequest",
            },
          },
        },
      },
      responses: { 200: { description: "Created" } },
    },
  },
};