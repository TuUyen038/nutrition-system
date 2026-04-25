module.exports = {
  "/exercises": {
    get: {
      tags: ["Exercise"],
      summary: "Lấy danh sách exercise",
      description:
        "Lấy toàn bộ exercises hoặc filter theo categoryId, muscleIds, equipmentIds",
      parameters: [
        {
          in: "query",
          name: "categoryId",
          schema: { type: "number" },
          description: "ID thể loại exercise",
        },
        {
          in: "query",
          name: "muscleIds",
          schema: { type: "string" },
          description: "IDs cơ bắp, ngăn cách dấu phẩy (ví dụ: 1,2,3)",
        },
        {
          in: "query",
          name: "equipmentIds",
          schema: { type: "string" },
          description: "IDs thiết bị, ngăn cách dấu phẩy (ví dụ: 1,2)",
        },
      ],
      responses: {
        200: {
          description: "Danh sách exercises",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Exercise" },
              },
            },
          },
        },
      },
    },
  },
  "/exercises/import": {
    post: {
      tags: ["Exercise"],
      summary: "Import exercises từ nguồn bên ngoài",
      responses: {
        201: {
          description: "Import thành công",
        },
        500: {
          description: "Lỗi server",
        },
      },
    },
  },
  "/exercises/{id}": {
    get: {
      tags: ["Exercise"],
      summary: "Lấy exercise theo id",
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "number" },
        },
      ],
      responses: {
        200: {
          description: "Thông tin exercise",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Exercise" },
            },
          },
        },
        404: {
          description: "Exercise không tồn tại",
        },
      },
    },
  },
};
