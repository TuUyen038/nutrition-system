module.exports = {
  User: {
    type: "object",
    properties: {
      _id: {
        type: "string",
        format: "ObjectId",
        description: "ID người dùng",
      },
      name: {
        type: "string",
        example: "Nguyễn Văn A",
      },
      email: {
        type: "string",
        format: "email",
        example: "user@example.com",
      },
      role: {
        type: "string",
        enum: ["USER", "ADMIN"],
        example: "USER",
      },
      age: {
        type: "number",
        example: 25,
      },
      gender: {
        type: "string",
        enum: ["male", "female", "other"],
      },
      height: {
        type: "number",
        example: 170,
        description: "Chiều cao (cm)",
      },
      weight: {
        type: "number",
        example: 70,
        description: "Cân nặng (kg)",
      },
      goal: {
        type: "string",
        enum: ["lose_weight", "maintain_weight", "gain_weight"],
      },
      allergies: {
        type: "array",
        items: { type: "string" },
      },
      isEmailVerified: {
        type: "boolean",
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
  UpdateUserRequest: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      gender: { type: "string", enum: ["male", "female", "other"] },
      height: { type: "number" },
      weight: { type: "number" },
      goal: {
        type: "string",
        enum: ["lose_weight", "maintain_weight", "gain_weight"],
      },
      allergies: { type: "array", items: { type: "string" } },
    },
  },
};
