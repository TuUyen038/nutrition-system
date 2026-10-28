const { z } = require("zod");

const emailSchema = z
  .string()
  .trim()
  .email("Email không hợp lệ")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(6, "Mật khẩu phải có ít nhất 6 ký tự");

const otpSchema = z
  .string()
  .regex(/^\d{6}$/, "OTP phải gồm đúng 6 chữ số");

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Dữ liệu đã validate + normalize
    req.body = result.data;

    next();
  };
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Tên không được để trống"),
  email: emailSchema,
  password: passwordSchema,

  age: z.coerce.number().positive().optional(),

  gender: z
    .enum(["male", "female", "other"])
    .optional(),

  height: z.coerce.number().positive().optional(),

  weight: z.coerce.number().positive().optional(),

  goal: z
    .enum([
      "lose_weight",
      "maintain_weight",
      "gain_weight",
    ])
    .optional(),

  fitnessLevel: z
    .enum([
      "sedentary",
      "beginner",
      "intermediate",
      "advanced",
      "athlete",
    ])
    .optional(),

  allergies: z.array(z.string()).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

const emailOnlySchema = z.object({
  email: emailSchema,
});

const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

const resetPasswordSchema = z.object({
  email: emailSchema,
  newPassword: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(
    1,
    "Vui lòng nhập mật khẩu hiện tại",
  ),
  newPassword: passwordSchema,
});

module.exports = {
  validateSignup: validate(signupSchema),
  validateLogin: validate(loginSchema),

  validateForgotPassword:
    validate(emailOnlySchema),

  validateResendResetPasswordOTP:
    validate(emailOnlySchema),

  validateSendVerificationOTP:
    validate(emailOnlySchema),

  validateResendVerificationOTP:
    validate(emailOnlySchema),

  validateVerifyResetPasswordOTP:
    validate(verifyOtpSchema),

  validateVerifyEmail:
    validate(verifyOtpSchema),

  validateResetPassword:
    validate(resetPasswordSchema),

  validateChangePassword:
    validate(changePasswordSchema),
};