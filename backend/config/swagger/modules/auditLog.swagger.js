module.exports = {
  "/audit-logs": {
    get: {
      tags: ["Audit Logs"],
      summary: "Lấy danh sách audit logs (ADMIN ONLY)",
      description: "Xem nhật ký tất cả hoạt động hệ thống",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Danh sách audit logs",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/AuditLog" },
              },
            },
          },
        },
        403: {
          description: "Chỉ ADMIN mới có quyền truy cập",
        },
      },
    },
  },
  "/audit-logs/{id}": {
    get: {
      tags: ["Audit Logs"],
      summary: "Lấy chi tiết một audit log (ADMIN ONLY)",
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
          description: "Chi tiết audit log",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuditLog" },
            },
          },
        },
        403: {
          description: "Chỉ ADMIN mới có quyền truy cập",
        },
        404: {
          description: "Audit log không tồn tại",
        },
      },
    },
  },
};
