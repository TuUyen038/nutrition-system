module.exports = {
  SignupRequest: {
    type: "object",
    required: ["name", "email", "password"],
    properties: {
      name: {
        type: "string",
        example: "Nguyễn Văn A",
        description: "Tên người dùng",
      },
      email: {
        type: "string",
        format: "email",
        example: "user@example.com",
        description: "Email duy nhất",
      },
      password: {
        type: "string",
        minLength: 6,
        example: "password123",
        description: "Mật khẩu tối thiểu 6 ký tự",
      },
      age: {
        type: "number",
        example: 25,
        description: "Tuổi của người dùng",
      },
      gender: {
        type: "string",
        enum: ["male", "female", "other"],
        example: "male",
        description: "Giới tính",
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
        example: "lose_weight",
        description: "Mục tiêu sức khỏe",
      },
      allergies: {
        type: "array",
        items: { type: "string" },
        example: ["peanut", "shellfish"],
        description: "Danh sách dị ứng thực phẩm",
      },
    },
  },
  LoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: {
        type: "string",
        format: "email",
        example: "user@example.com",
      },
      password: {
        type: "string",
        example: "password123",
      },
    },
  },
  ForgotPasswordRequest: {
    type: "object",
    required: ["email"],
    properties: {
      email: {
        type: "string",
        format: "email",
        example: "user@example.com",
        description: "Email để gửi OTP reset password",
      },
    },
  },
  VerifyResetPasswordOTPRequest: {
    type: "object",
    required: ["email", "otp"],
    properties: {
      email: {
        type: "string",
        format: "email",
      },
      otp: {
        type: "string",
        example: "123456",
        description: "OTP gồm 6 chữ số",
      },
    },
  },
  ResetPasswordRequest: {
    type: "object",
    required: ["email", "otp", "newPassword"],
    properties: {
      email: {
        type: "string",
        format: "email",
      },
      otp: {
        type: "string",
        example: "123456",
      },
      newPassword: {
        type: "string",
        minLength: 6,
        example: "newpassword123",
      },
    },
  },
  SendVerificationOTPRequest: {
    type: "object",
    required: ["email"],
    properties: {
      email: {
        type: "string",
        format: "email",
        description: "Email để gửi OTP xác thực",
      },
    },
  },
  VerifyEmailRequest: {
    type: "object",
    required: ["email", "otp"],
    properties: {
      email: {
        type: "string",
        format: "email",
      },
      otp: {
        type: "string",
        example: "123456",
        description: "OTP xác thực email",
      },
    },
  },
  ChangePasswordRequest: {
    type: "object",
    required: ["oldPassword", "newPassword"],
    properties: {
      oldPassword: {
        type: "string",
        example: "oldpassword123",
      },
      newPassword: {
        type: "string",
        minLength: 6,
        example: "newpassword123",
      },
    },
  },
  AuthResponse: {
    type: "object",
    properties: {
      message: {
        type: "string",
      },
      token: {
        type: "string",
        description: "JWT token để dùng trong các request sau",
      },
      user: {
        $ref: "#/components/schemas/User",
      },
      requiresEmailVerification: {
        type: "boolean",
        description: "Có cần xác thực email hay không",
      },
    },
  },
};
