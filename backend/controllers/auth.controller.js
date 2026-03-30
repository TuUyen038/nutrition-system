const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { logAction } = require("../middlewares/auditLog");
const emailService = require("../services/email.service");
const { createNutritionGoal } = require("../services/nutritionGoal.service");

// Helper function để tạo JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || "your-secret-key-change-in-production",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
};

/**
 * Đăng ký tài khoản mới
 */
exports.signup = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      age,
      gender,
      height,
      weight,
      goal,
      fitnessLevel,
      allergies,
    } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Vui lòng điền đầy đủ thông tin: tên, email và mật khẩu",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    // Kiểm tra email đã tồn tại
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        message: "Email này đã được sử dụng",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo user mới
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "USER",
      age,
      gender,
      height,
      weight,
      goal,
      fitnessLevel,
      allergies: allergies || [],
    });

    // Tạo OTP (6 chữ số)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 phút

    // Lưu OTP vào user
    newUser.emailVerificationOTP = otp;
    newUser.emailVerificationOTPExpires = otpExpires;
    await newUser.save();

    // Gửi OTP qua email
    try {
      await emailService.sendVerificationOTP(newUser.email, otp, newUser.name);
    } catch (emailError) {
      console.error("Lỗi khi gửi email OTP:", emailError);
      // Vẫn cho phép đăng ký thành công, nhưng thông báo cần verify sau
    }

    // Tạo token
    const token = generateToken(newUser._id);

    // Ghi audit log
    await logAction(
      req,
      "CREATE",
      "User",
      newUser._id,
      null,
      { name: newUser.name, email: newUser.email, role: newUser.role },
      "User signup",
    );

    // Trả về user (không có password) và token
    const userData = newUser.toObject();
    delete userData.password;
    delete userData.resetPasswordToken;
    delete userData.resetPasswordExpires;
    delete userData.emailVerificationOTP;
    delete userData.emailVerificationOTPExpires;

    res.status(201).json({
      message:
        "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",
      token,
      user: userData,
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      message: "Lỗi khi đăng ký: " + error.message,
    });
  }
};

/**
 * Đăng nhập
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    // Tìm user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Ghi log đăng nhập thất bại (không có userId vì user không tồn tại)
      // Không ghi audit log cho trường hợp này vì không có userId
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // Kiểm tra password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Ghi log đăng nhập thất bại
      await logAction(
        req,
        "LOGIN",
        "Auth",
        user._id,
        null,
        null,
        `Failed login attempt: wrong password for ${user.email}`,
        user._id, // userIdOverride
        user.email, // userEmailOverride
      );
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // Tạo token
    const token = generateToken(user._id);

    // Ghi audit log (pass userId và email vì req.user chưa có khi login)
    await logAction(
      req,
      "LOGIN",
      "Auth",
      user._id,
      null,
      { email: user.email, role: user.role },
      "User login",
      user._id, // userIdOverride
      user.email, // userEmailOverride
    );

    // Trả về user (không có password) và token
    const userData = user.toObject();
    delete userData.password;
    delete userData.resetPasswordToken;
    delete userData.resetPasswordExpires;
    delete userData.resetPasswordOTP;
    delete userData.resetPasswordOTPExpires;
    delete userData.emailVerificationOTP;
    delete userData.emailVerificationOTPExpires;

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Lỗi khi đăng nhập: " + error.message,
    });
  }
};

/**
 * Yêu cầu reset password (Forgot Password) - Dùng OTP
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Vui lòng nhập email",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Không tiết lộ nếu email không tồn tại (bảo mật)
    if (!user) {
      // Vẫn trả về success để không tiết lộ email có tồn tại hay không
      return res.json({
        message: "Nếu email tồn tại, chúng tôi đã gửi mã OTP đến email của bạn",
      });
    }

    // Kiểm tra cooldown (tránh spam) - chỉ cho phép gửi lại sau 1 phút
    if (
      user.resetPasswordOTPExpires &&
      user.resetPasswordOTPExpires > Date.now() - 60000
    ) {
      return res.status(429).json({
        message: "Vui lòng đợi 1 phút trước khi yêu cầu mã mới",
      });
    }

    // Tạo OTP (6 chữ số)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 phút

    // Lưu OTP và reset flag
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpires = otpExpires;
    user.resetPasswordOTPVerified = false; // Reset flag
    await user.save();

    // Gửi OTP qua email
    try {
      await emailService.sendResetPasswordOTP(user.email, otp, user.name);
    } catch (emailError) {
      console.error("Lỗi khi gửi email OTP reset password:", emailError);
      return res.status(500).json({
        message: "Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.",
      });
    }

    // Ghi audit log
    await logAction(
      req,
      "PASSWORD_RESET_REQUEST",
      "Auth",
      user._id,
      null,
      null,
      `Password reset OTP sent to ${user.email}`,
      user._id,
      user.email,
    );

    res.json({
      message: "Mã OTP đã được gửi đến email của bạn",
      requiresOTPVerification: true,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      message: "Lỗi khi xử lý yêu cầu reset password: " + error.message,
    });
  }
};

/**
 * Xác thực OTP reset password
 */
exports.verifyResetPasswordOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mã OTP",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: "Email không tồn tại trong hệ thống",
      });
    }

    // Kiểm tra OTP
    if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
      return res.status(400).json({
        message: "Mã OTP không hợp lệ. Vui lòng yêu cầu mã mới.",
      });
    }

    if (user.resetPasswordOTPExpires < Date.now()) {
      return res.status(400).json({
        message: "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
      });
    }

    if (user.resetPasswordOTP !== otp) {
      return res.status(400).json({
        message: "Mã OTP không đúng",
      });
    }

    // Đánh dấu OTP đã được verify
    user.resetPasswordOTPVerified = true;
    await user.save();

    // Ghi audit log
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

    res.json({
      message: "Mã OTP đã được xác thực. Vui lòng đặt mật khẩu mới.",
      verified: true,
    });
  } catch (error) {
    console.error("Verify reset password OTP error:", error);
    res.status(500).json({
      message: "Lỗi khi xác thực mã OTP: " + error.message,
    });
  }
};

/**
 * Reset password với OTP đã verify
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        message: "Vui lòng cung cấp email và mật khẩu mới",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    // Tìm user với OTP đã được verify
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: "Email không tồn tại trong hệ thống",
      });
    }

    // Kiểm tra OTP đã được verify chưa
    if (!user.resetPasswordOTPVerified) {
      return res.status(400).json({
        message: "Vui lòng xác thực mã OTP trước khi đặt lại mật khẩu",
      });
    }

    // Kiểm tra OTP còn hiệu lực không
    if (
      !user.resetPasswordOTPExpires ||
      user.resetPasswordOTPExpires < Date.now()
    ) {
      return res.status(400).json({
        message: "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
      });
    }

    // Hash password mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Lưu password mới và xóa reset OTP
    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    user.resetPasswordOTPVerified = false;
    await user.save();

    // Ghi audit log
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

    res.json({
      message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Lỗi khi đặt lại mật khẩu: " + error.message,
    });
  }
};

/**
 * Gửi lại OTP reset password
 */
exports.resendResetPasswordOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Vui lòng nhập email",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: "Email không tồn tại trong hệ thống",
      });
    }

    // Kiểm tra cooldown (tránh spam) - chỉ cho phép gửi lại sau 1 phút
    if (
      user.resetPasswordOTPExpires &&
      user.resetPasswordOTPExpires > Date.now() - 60000
    ) {
      return res.status(429).json({
        message: "Vui lòng đợi 1 phút trước khi yêu cầu mã mới",
      });
    }

    // Tạo OTP mới
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 phút

    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpires = otpExpires;
    user.resetPasswordOTPVerified = false; // Reset flag
    await user.save();

    // Gửi OTP qua email
    try {
      await emailService.sendResetPasswordOTP(user.email, otp, user.name);
    } catch (emailError) {
      console.error("Lỗi khi gửi email OTP reset password:", emailError);
      return res.status(500).json({
        message: "Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.",
      });
    }

    // Ghi audit log
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

    res.json({
      message: "Mã OTP mới đã được gửi đến email của bạn",
    });
  } catch (error) {
    console.error("Resend reset password OTP error:", error);
    res.status(500).json({
      message: "Lỗi khi gửi lại mã OTP: " + error.message,
    });
  }
};

/**
 * Gửi OTP xác thực email (cho user đã đăng ký nhưng chưa verify)
 */
exports.sendVerificationOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Vui lòng nhập email",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: "Email không tồn tại trong hệ thống",
      });
    }

    // Nếu đã verify rồi thì không cần gửi lại
    if (user.isEmailVerified) {
      return res.status(400).json({
        message: "Email này đã được xác thực",
      });
    }

    // Kiểm tra cooldown (tránh spam) - chỉ cho phép gửi lại sau 1 phút
    if (
      user.emailVerificationOTPExpires &&
      user.emailVerificationOTPExpires > Date.now() - 60000
    ) {
      return res.status(429).json({
        message: "Vui lòng đợi 1 phút trước khi yêu cầu mã mới",
      });
    }

    // Tạo OTP mới (6 chữ số)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 phút

    // Lưu OTP vào user
    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpires = otpExpires;
    await user.save();

    // Gửi OTP qua email
    try {
      await emailService.sendVerificationOTP(user.email, otp, user.name);
    } catch (emailError) {
      console.error("Lỗi khi gửi email OTP:", emailError);
      return res.status(500).json({
        message: "Không thể gửi email xác thực. Vui lòng thử lại sau.",
      });
    }

    // Ghi audit log
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

    res.json({
      message: "Mã OTP đã được gửi đến email của bạn",
    });
  } catch (error) {
    console.error("Send verification OTP error:", error);
    res.status(500).json({
      message: "Lỗi khi gửi mã OTP: " + error.message,
    });
  }
};

/**
 * Xác thực email bằng OTP
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mã OTP",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: "Email không tồn tại trong hệ thống",
      });
    }

    // Nếu đã verify rồi
    if (user.isEmailVerified) {
      return res.status(400).json({
        message: "Email này đã được xác thực",
      });
    }

    // Kiểm tra OTP
    if (!user.emailVerificationOTP || !user.emailVerificationOTPExpires) {
      return res.status(400).json({
        message: "Mã OTP không hợp lệ. Vui lòng yêu cầu mã mới.",
      });
    }

    if (user.emailVerificationOTPExpires < Date.now()) {
      return res.status(400).json({
        message: "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
      });
    }

    if (user.emailVerificationOTP !== otp) {
      return res.status(400).json({
        message: "Mã OTP không đúng",
      });
    }

    // Đánh dấu email đã được verify và xóa OTP
    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpires = undefined;

    //tính toán goal
    if (user.age && user.gender && user.height && user.weight && user.goal) {
      await createNutritionGoal(user);
    }

    await user.save();

    // Gửi email thông báo xác thực thành công
    try {
      await emailService.sendVerificationSuccess(user.email, user.name);
    } catch (emailError) {
      console.error("Lỗi khi gửi email thông báo:", emailError);
      // Không ảnh hưởng đến kết quả verify
    }

    // Tạo token mới (nếu user đã đăng nhập)
    let token = null;
    if (req.headers.authorization) {
      token = generateToken(user._id);
    }

    // Ghi audit log
    await logAction(
      req,
      "EMAIL_VERIFIED",
      "Auth",
      user._id,
      null,
      { isEmailVerified: true },
      `Email verified for ${user.email}`,
      user._id,
      user.email,
    );

    // Trả về user (không có password và OTP)
    const userData = user.toObject();
    delete userData.password;
    delete userData.resetPasswordToken;
    delete userData.resetPasswordExpires;
    delete userData.resetPasswordOTP;
    delete userData.resetPasswordOTPExpires;
    delete userData.emailVerificationOTP;
    delete userData.emailVerificationOTPExpires;

    res.json({
      message: "Xác thực email thành công",
      user: userData,
      token, // Trả về token nếu có
    });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({
      message: "Lỗi khi xác thực email: " + error.message,
    });
  }
};

/**
 * Gửi lại OTP xác thực email
 */
exports.resendVerificationOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Vui lòng nhập email",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: "Email không tồn tại trong hệ thống",
      });
    }

    // Nếu đã verify rồi thì không cần gửi lại
    if (user.isEmailVerified) {
      return res.status(400).json({
        message: "Email này đã được xác thực",
      });
    }

    // Kiểm tra cooldown (tránh spam) - chỉ cho phép gửi lại sau 1 phút
    if (
      user.emailVerificationOTPExpires &&
      user.emailVerificationOTPExpires > Date.now() - 60000
    ) {
      return res.status(429).json({
        message: "Vui lòng đợi 1 phút trước khi yêu cầu mã mới",
      });
    }

    // Tạo OTP mới (6 chữ số)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 phút

    // Lưu OTP vào user
    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpires = otpExpires;
    await user.save();

    // Gửi OTP qua email
    try {
      await emailService.sendVerificationOTP(user.email, otp, user.name);
    } catch (emailError) {
      console.error("Lỗi khi gửi email OTP:", emailError);
      return res.status(500).json({
        message: "Không thể gửi email xác thực. Vui lòng thử lại sau.",
      });
    }

    // Ghi audit log
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

    res.json({
      message: "Mã OTP mới đã được gửi đến email của bạn",
    });
  } catch (error) {
    console.error("Resend verification OTP error:", error);
    res.status(500).json({
      message: "Lỗi khi gửi lại mã OTP: " + error.message,
    });
  }
};

/**
 * Đổi mật khẩu (khi đã đăng nhập)
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
    }

    // Lấy user với password
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: "User không tồn tại",
      });
    }

    // Kiểm tra mật khẩu hiện tại
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Mật khẩu hiện tại không đúng",
      });
    }

    // Hash password mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Ghi audit log
    await logAction(
      req,
      "PASSWORD_RESET",
      "Auth",
      user._id,
      null,
      null,
      `Password changed by user ${user.email}`,
    );

    res.json({
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      message: "Lỗi khi đổi mật khẩu: " + error.message,
    });
  }
};

/**
 * Lấy thông tin user hiện tại (sau khi đăng nhập)
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -resetPasswordToken -resetPasswordExpires -resetPasswordOTP -resetPasswordOTPExpires -emailVerificationOTP -emailVerificationOTPExpires",
    );

    if (!user) {
      return res.status(404).json({
        message: "User không tồn tại",
      });
    }

    res.json(user);
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({
      message: "Lỗi khi lấy thông tin user: " + error.message,
    });
  }
};
