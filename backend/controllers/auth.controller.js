const authService = require("../services/auth.service");

const { logAction } = require("../middlewares/auditLog");


function handleError(res, error) {
  console.error(error);

  if (error.statusCode) {
    return res
      .status(error.statusCode)
      .json({
        message: error.message,
      });
  }

  return res.status(500).json({
    message: "Đã xảy ra lỗi hệ thống",
  });
}


/* =========================
   SIGNUP
========================= */

exports.signup = async (req, res) => {
  try {
    const result =
      await authService.signup(req.body);

    await logAction(
      req,
      "CREATE",
      "User",
      result.user._id,
      null,
      {
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
      "User signup",
      result.user._id,
      result.user.email,
    );

    return res.status(201).json({
      message:
        "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",

      user: result.user,

      requiresEmailVerification: true,
    });
  } catch (error) {
    return handleError(res, error);
  }
};


/* =========================
   LOGIN
========================= */

exports.login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    const result =
      await authService.login(
        email,
        password,
      );

    await logAction(
      req,
      "LOGIN",
      "Auth",
      result.user._id,
      null,
      {
        email: result.user.email,
        role: result.user.role,
      },
      "User login",
      result.user._id,
      result.user.email,
    );

    return res.json({
      message:
        "Đăng nhập thành công",

      token: result.token,

      user: result.user,
    });
  } catch (error) {
    return handleError(res, error);
  }
};


/* =========================
   FORGOT PASSWORD
========================= */

exports.forgotPassword =
  async (req, res) => {
    try {
      await authService
        .forgotPassword(
          req.body.email,
        );

      /*
       * Luôn cùng response,
       * tránh reveal email existence.
       */
      return res.json({
        message:
          "Mã OTP đã được gửi đến email của bạn",
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   VERIFY RESET OTP
========================= */

exports.verifyResetPasswordOTP =
  async (req, res) => {
    try {
      const user =
        await authService
          .verifyResetPasswordOTP(
            req.body.email,
            req.body.otp,
          );

      await logAction(
        req,
        "PASSWORD_RESET_REQUEST",
        "Auth",
        user._id,
        null,
        null,
        `Reset password OTP verified for ${user.email}`,
        user._id,
        user.email,
      );

      return res.json({
        message:
          "OTP đã được xác thực. Vui lòng đặt mật khẩu mới.",

        verified: true,
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   RESET PASSWORD
========================= */

exports.resetPassword =
  async (req, res) => {
    try {
      const user =
        await authService
          .resetPassword(
            req.body.email,
            req.body.newPassword,
          );

      await logAction(
        req,
        "PASSWORD_RESET",
        "Auth",
        user._id,
        null,
        null,
        `Password reset successful for ${user.email}`,
        user._id,
        user.email,
      );

      return res.json({
        message:
          "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   RESEND RESET OTP
========================= */

exports.resendResetPasswordOTP =
  async (req, res) => {
    try {
      const user =
        await authService
          .resendResetPasswordOTP(
            req.body.email,
          );

      if (user) {
        await logAction(
          req,
          "PASSWORD_RESET_REQUEST",
          "Auth",
          user._id,
          null,
          null,
          `Reset password OTP resent to ${user.email}`,
          user._id,
          user.email,
        );
      }

      return res.json({
        message:
          "Nếu email tồn tại, mã OTP mới đã được gửi.",
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   SEND VERIFICATION OTP
========================= */

exports.sendVerificationOTP =
  async (req, res) => {
    try {
      const user =
        await authService
          .sendVerificationOTP(
            req.body.email,
          );

      await logAction(
        req,
        "EMAIL_VERIFICATION_REQUEST",
        "Auth",
        user._id,
        null,
        null,
        `Verification OTP sent to ${user.email}`,
        user._id,
        user.email,
      );

      return res.json({
        message:
          "Mã OTP đã được gửi đến email của bạn",
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   VERIFY EMAIL
========================= */

exports.verifyEmail =
  async (req, res) => {
    try {
      const result =
        await authService.verifyEmail(
          req.body.email,
          req.body.otp,
        );

      await logAction(
        req,
        "EMAIL_VERIFIED",
        "Auth",
        result.user._id,
        null,
        {
          isEmailVerified: true,
        },
        `Email verified for ${result.user.email}`,
        result.user._id,
        result.user.email,
      );

      return res.json({
        message:
          "Xác thực email thành công",

        user: result.safeUser,
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   RESEND VERIFICATION OTP
========================= */

exports.resendVerificationOTP =
  async (req, res) => {
    try {
      const user =
        await authService
          .resendVerificationOTP(
            req.body.email,
          );

      await logAction(
        req,
        "EMAIL_VERIFICATION_REQUEST",
        "Auth",
        user._id,
        null,
        null,
        `Verification OTP resent to ${user.email}`,
        user._id,
        user.email,
      );

      return res.json({
        message:
          "Mã OTP mới đã được gửi đến email của bạn",
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   CHANGE PASSWORD
========================= */

exports.changePassword =
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      const user =
        await authService
          .changePassword(
            req.user._id,
            currentPassword,
            newPassword,
          );

      await logAction(
        req,
        "PASSWORD_CHANGED",
        "Auth",
        user._id,
        null,
        null,
        `Password changed by user ${user.email}`,
      );

      return res.json({
        message:
          "Đổi mật khẩu thành công",
      });
    } catch (error) {
      return handleError(res, error);
    }
  };


/* =========================
   GET CURRENT USER
========================= */

exports.getMe = async (req, res) => {
  try {
    const user =
      await authService.getMe(
        req.user._id,
      );

    return res.json(user);
  } catch (error) {
    return handleError(res, error);
  }
};