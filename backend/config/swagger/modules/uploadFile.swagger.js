module.exports = {
  "/upload-image": {
    post: {
      tags: ["Upload"],
      summary: "Tải lên ảnh",
      description:
        "Tải lên ảnh (công thức, nguyên liệu, avatar...) lên Cloudinary",
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["image"],
              properties: {
                image: {
                  type: "string",
                  format: "binary",
                  description: "File ảnh",
                },
                type: {
                  type: "string",
                  enum: ["recipe", "ingredient", "avatar", "general"],
                  default: "general",
                  description: "Loại ảnh (tùy chọn)",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Ảnh đã được tải lên",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  url: { type: "string", format: "uri" },
                  public_id: { type: "string" },
                },
              },
            },
          },
        },
        400: {
          description: "Không có file hoặc file không hợp lệ",
        },
      },
    },
  },
};
