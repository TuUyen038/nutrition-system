module.exports = {
  "/users": {
    get: {
      tags: ["Users"],
      summary: "Lấy danh sách tất cả users (ADMIN ONLY)",
      description: "Chỉ ADMIN mới có thể lấy danh sách tất cả người dùng",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Danh sách người dùng",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/User" },
              },
            },
          },
        },
        403: {
          description: "Không có quyền truy cập",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/users/{id}": {
    get: {
      tags: ["Users"],
      summary: "Lấy thông tin user theo ID",
      description:
        "USER chỉ có thể xem thông tin của chính mình, ADMIN có thể xem ai cũng được",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "ObjectId" },
          description: "ID của người dùng",
        },
      ],
      responses: {
        200: {
          description: "Thông tin người dùng",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
            },
          },
        },
        403: {
          description: "Không có quyền xem thông tin này",
        },
        404: {
          description: "Người dùng không tồn tại",
        },
      },
    },
    put: {
      tags: ["Users"],
      summary: "Cập nhật thông tin user",
      description:
        "USER chỉ có thể cập nhật thông tin của chính mình, ADMIN có thể cập nhật ai cũng được",
      security: [{ bearerAuth: [] }],
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
            schema: { $ref: "#/components/schemas/UpdateUserRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Thông tin user đã được cập nhật",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  user: { $ref: "#/components/schemas/User" },
                },
              },
            },
          },
        },
        403: {
          description: "Không có quyền cập nhật",
        },
        404: {
          description: "Người dùng không tồn tại",
        },
      },
    },
    delete: {
      tags: ["Users"],
      summary: "Xóa user (ADMIN ONLY)",
      description: "Xóa tài khoản người dùng",
      security: [{ bearerAuth: [] }],
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
          description: "Người dùng đã được xóa",
        },
        403: {
          description: "Không có quyền xóa",
        },
        404: {
          description: "Người dùng không tồn tại",
        },
      },
    },
  },
};
