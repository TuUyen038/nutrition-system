module.exports = {
  "/auth/signup": {
    post: {
      tags: ["Auth"],
      summary: "Đăng ký tài khoản mới",
      description: "Tạo tài khoản người dùng mới với email và mật khẩu",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SignupRequest" },
          },
        },
      },
      responses: {
        201: {
          description: "Đăng ký thành công, OTP đã được gửi",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthResponse" },
            },
          },
        },
        400: {
          description: "Dữ liệu không hợp lệ hoặc email đã tồn tại",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        500: {
          description: "Lỗi server",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Đăng nhập",
      description:
        "Xác thực người dùng bằng email và mật khẩu, trả về JWT token",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LoginRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Đăng nhập thành công",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthResponse" },
            },
          },
        },
        401: {
          description: "Email hoặc mật khẩu không đúng",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        500: {
          description: "Lỗi server",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/forgot-password": {
    post: {
      tags: ["Auth"],
      summary: "Quên mật khẩu",
      description: "Gửi OTP đến email để reset mật khẩu",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "OTP đã được gửi đến email",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
        404: {
          description: "Email không tồn tại",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/verify-reset-password-otp": {
    post: {
      tags: ["Auth"],
      summary: "Xác thực OTP reset password",
      description: "Kiểm tra OTP hợp lệ",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/VerifyResetPasswordOTPRequest",
            },
          },
        },
      },
      responses: {
        200: {
          description: "OTP hợp lệ",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
        400: {
          description: "OTP không hợp lệ hoặc hết hạn",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/reset-password": {
    post: {
      tags: ["Auth"],
      summary: "Reset mật khẩu",
      description: "Thay đổi mật khẩu với OTP hợp lệ",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Mật khẩu đã được reset thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
        400: {
          description: "Request không hợp lệ",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/send-verification-otp": {
    post: {
      tags: ["Auth"],
      summary: "Gửi OTP xác thực email",
      description: "Gửi OTP để xác thực email đăng ký",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/SendVerificationOTPRequest",
            },
          },
        },
      },
      responses: {
        200: {
          description: "OTP đã được gửi",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/auth/verify-email": {
    post: {
      tags: ["Auth"],
      summary: "Xác thực email",
      description: "Xác thực email người dùng với OTP",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/VerifyEmailRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Email đã xác thực thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/auth/resend-verification-otp": {
    post: {
      tags: ["Auth"],
      summary: "Gửi lại OTP xác thực",
      description: "Gửi lại OTP nếu người dùng không nhận được",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/SendVerificationOTPRequest",
            },
          },
        },
      },
      responses: {
        200: {
          description: "OTP đã được gửi lại",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/auth/resend-reset-password-otp": {
    post: {
      tags: ["Auth"],
      summary: "Gửi lại OTP reset password",
      description: "Gửi lại OTP nếu người dùng không nhận được",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/SendVerificationOTPRequest",
            },
          },
        },
      },
      responses: {
        200: {
          description: "OTP đã được gửi lại",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Lấy thông tin người dùng hiện tại",
      description: "Lấy thông tin profile của người dùng đã đăng nhập",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Thông tin người dùng",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
            },
          },
        },
        401: {
          description: "Chưa xác thực",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/change-password": {
    put: {
      tags: ["Auth"],
      summary: "Đổi mật khẩu",
      description: "Thay đổi mật khẩu của người dùng đã đăng nhập",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ChangePasswordRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Mật khẩu đã được thay đổi",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
        401: {
          description: "Mật khẩu cũ không đúng",
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
