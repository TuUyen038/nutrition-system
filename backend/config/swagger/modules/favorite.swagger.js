module.exports = {
  "/favorites": {
    get: {
      tags: ["Favorites"],
      summary: "Lấy danh sách công thức yêu thích",
      description: "Lấy tất cả công thức được lưu yêu thích",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Danh sách công thức yêu thích",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Favorite" },
              },
            },
          },
        },
      },
    },
  },
  "/favorites/{recipeId}": {
    post: {
      tags: ["Favorites"],
      summary: "Thêm công thức vào yêu thích",
      description: "Lưu một công thức vào danh sách yêu thích",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "recipeId",
          required: true,
          schema: { type: "string", format: "ObjectId" },
        },
      ],
      responses: {
        201: {
          description: "Công thức đã được lưu",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Favorite" },
            },
          },
        },
      },
    },
    delete: {
      tags: ["Favorites"],
      summary: "Xóa công thức khỏi yêu thích",
      description: "Bỏ một công thức khỏi danh sách yêu thích",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "recipeId",
          required: true,
          schema: { type: "string", format: "ObjectId" },
        },
      ],
      responses: {
        200: {
          description: "Công thức đã được xóa khỏi yêu thích",
        },
      },
    },
  },
  "/favorites/check/{recipeId}": {
    get: {
      tags: ["Favorites"],
      summary: "Kiểm tra công thức có trong yêu thích không",
      description:
        "Kiểm tra xem công thức đó có trong danh sách yêu thích không",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "recipeId",
          required: true,
          schema: { type: "string", format: "ObjectId" },
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
                  isFavorite: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/favorites/toggle/{recipeId}": {
    post: {
      tags: ["Favorites"],
      summary: "Toggle (bật/tắt) yêu thích",
      description: "Thêm hoặc xóa công thức khỏi yêu thích (toggle)",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "recipeId",
          required: true,
          schema: { type: "string", format: "ObjectId" },
        },
      ],
      responses: {
        200: {
          description: "Trạng thái yêu thích đã được thay đổi",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Favorite" },
            },
          },
        },
      },
    },
  },
};
