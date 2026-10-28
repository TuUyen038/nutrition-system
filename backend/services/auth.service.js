const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const otpService = require("./otp.service");
const emailService = require("./email.service");
const {
  createNutritionGoal,
} = require("./nutritionGoal.service");


class ServiceError extends Error {
  constructor(statusCode, message) {
    super(message);

    this.statusCode = statusCode;
  }
}


function generateToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required",
    );
  }

  return jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        "7d",
    },
  );
}


function toSafeUser(user) {
  const data = user.toObject();

  delete data.password;

  delete data.resetPasswordOTP;
  delete data.resetPasswordOTPExpires;
  delete data.resetPasswordOTPVerified;
  delete data.resetPasswordOTPLastSentAt;

  delete data.emailVerificationOTP;
  delete data.emailVerificationOTPExpires;
  delete data.emailVerificationOTPLastSentAt;

  return data;
}


/* =========================
   EMAIL VERIFICATION OTP
========================= */

async function issueEmailVerificationOTP(
  user,
) {
  if (
    !otpService.canResend(
      user.emailVerificationOTPLastSentAt,
    )
  ) {
    const seconds =
      otpService.getRemainingCooldown(
        user.emailVerificationOTPLastSentAt,
      );

    throw new ServiceError(
      429,
      `Vui lòng đợi ${seconds} giây trước khi yêu cầu mã mới`,
    );
  }

  const otp =
    otpService.generateOTP();

  user.emailVerificationOTP =
    otpService.hashOTP(otp);

  user.emailVerificationOTPExpires =
    otpService.getExpirationDate();

  user.emailVerificationOTPLastSentAt =
    new Date();

  await user.save();

  await emailService.sendVerificationOTP(
    user.email,
    otp,
    user.name,
  );
}


/* =========================
   RESET PASSWORD OTP
========================= */

async function issueResetPasswordOTP(user) {
  if (
    !otpService.canResend(
      user.resetPasswordOTPLastSentAt,
    )
  ) {
    const seconds =
      otpService.getRemainingCooldown(
        user.resetPasswordOTPLastSentAt,
      );

    throw new ServiceError(
      429,
      `Vui lòng đợi ${seconds} giây trước khi yêu cầu mã mới`,
    );
  }

  const otp =
    otpService.generateOTP();

  user.resetPasswordOTP =
    otpService.hashOTP(otp);

  user.resetPasswordOTPExpires =
    otpService.getExpirationDate();

  user.resetPasswordOTPLastSentAt =
    new Date();

  user.resetPasswordOTPVerified = false;

  await user.save();

  await emailService.sendResetPasswordOTP(
    user.email,
    otp,
    user.name,
  );
}


/* =========================
   SIGNUP
========================= */

async function signup(data) {
  const existingUser =
    await User.findOne({
      email: data.email,
    });

  if (existingUser) {
    throw new ServiceError(
      409,
      "Email này đã được sử dụng",
    );
  }

  const hashedPassword =
    await bcrypt.hash(
      data.password,
      10,
    );

  const user = new User({
    name: data.name,
    email: data.email,
    password: hashedPassword,

    role: "USER",

    age: data.age,
    gender: data.gender,
    height: data.height,
    weight: data.weight,
    goal: data.goal,
    fitnessLevel: data.fitnessLevel,
    allergies: data.allergies || [],
  });

  /*
   * Signup là lần đầu gửi OTP,
   * không cần check resend cooldown.
   */
  const otp =
    otpService.generateOTP();

  user.emailVerificationOTP =
    otpService.hashOTP(otp);

  user.emailVerificationOTPExpires =
    otpService.getExpirationDate();

  user.emailVerificationOTPLastSentAt =
    new Date();

  await user.save();

  try {
    await emailService.sendVerificationOTP(
      user.email,
      otp,
      user.name,
    );
  } catch (error) {
    /*
     * User vẫn được tạo.
     * Có thể resend OTP sau.
     */
    console.error(
      "Send verification email failed:",
      error,
    );
  }

  /*
   * Mình KHÔNG cấp JWT ở đây.
   * User verify email rồi mới login.
   */

  return {
    user: toSafeUser(user),
  };
}


/* =========================
   LOGIN
========================= */

async function login(email, password) {
  const user =
    await User.findOne({
      email,
    });

  if (!user) {
    throw new ServiceError(
      401,
      "Email hoặc mật khẩu không đúng",
    );
  }

  const isPasswordValid =
    await bcrypt.compare(
      password,
      user.password,
    );

  if (!isPasswordValid) {
    throw new ServiceError(
      401,
      "Email hoặc mật khẩu không đúng",
    );
  }

  if (!user.isEmailVerified) {
    throw new ServiceError(
      403,
      "Vui lòng xác thực email trước khi đăng nhập",
    );
  }

  const token =
    generateToken(user._id);

  return {
    token,
    user: toSafeUser(user),
  };
}


/* =========================
   FORGOT PASSWORD
========================= */

async function forgotPassword(email) {
  const user =
    await User.findOne({
      email,
    });

  /*
   * Không tiết lộ email
   * có tồn tại hay không.
   */
  if (!user) {
    return;
  }

  await issueResetPasswordOTP(user);
}


/* =========================
   VERIFY RESET OTP
========================= */

async function verifyResetPasswordOTP(
  email,
  otp,
) {
  const user =
    await User.findOne({
      email,
    });

  if (!user) {
    throw new ServiceError(
      400,
      "Mã OTP không hợp lệ",
    );
  }

  if (
    !user.resetPasswordOTP ||
    !user.resetPasswordOTPExpires
  ) {
    throw new ServiceError(
      400,
      "Mã OTP không hợp lệ. Vui lòng yêu cầu mã mới.",
    );
  }

  if (
    otpService.isExpired(
      user.resetPasswordOTPExpires,
    )
  ) {
    throw new ServiceError(
      400,
      "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
    );
  }

  const valid =
    otpService.verifyOTP(
      otp,
      user.resetPasswordOTP,
    );

  if (!valid) {
    throw new ServiceError(
      400,
      "Mã OTP không đúng",
    );
  }

  user.resetPasswordOTPVerified = true;

  await user.save();

  return user;
}


/* =========================
   RESET PASSWORD
========================= */

async function resetPassword(
  email,
  newPassword,
) {
  const user =
    await User.findOne({
      email,
    });

  if (!user) {
    throw new ServiceError(
      400,
      "Không thể đặt lại mật khẩu",
    );
  }

  if (
    !user.resetPasswordOTPVerified
  ) {
    throw new ServiceError(
      400,
      "Vui lòng xác thực OTP trước",
    );
  }

  if (
    otpService.isExpired(
      user.resetPasswordOTPExpires,
    )
  ) {
    throw new ServiceError(
      400,
      "OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
    );
  }

  user.password =
    await bcrypt.hash(
      newPassword,
      10,
    );

  // Invalidate OTP ngay
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpires =
    undefined;

  user.resetPasswordOTPVerified = false;
  user.resetPasswordOTPLastSentAt =
    undefined;

  await user.save();

  return user;
}


/* =========================
   RESEND RESET OTP
========================= */

async function resendResetPasswordOTP(
  email,
) {
  const user =
    await User.findOne({
      email,
    });

  if (!user) {
    /*
     * Không reveal account existence.
     */
    return;
  }

  await issueResetPasswordOTP(user);

  return user;
}


/* =========================
   SEND EMAIL VERIFICATION OTP
========================= */

async function sendVerificationOTP(
  email,
) {
  const user =
    await User.findOne({
      email,
    });

  if (!user) {
    throw new ServiceError(
      404,
      "User không tồn tại",
    );
  }

  if (user.isEmailVerified) {
    throw new ServiceError(
      400,
      "Email này đã được xác thực",
    );
  }

  await issueEmailVerificationOTP(user);

  return user;
}


/* =========================
   VERIFY EMAIL
========================= */

async function verifyEmail(
  email,
  otp,
) {
  const user =
    await User.findOne({
      email,
    });

  if (!user) {
    throw new ServiceError(
      400,
      "OTP không hợp lệ",
    );
  }

  if (user.isEmailVerified) {
    throw new ServiceError(
      400,
      "Email này đã được xác thực",
    );
  }

  if (
    !user.emailVerificationOTP ||
    !user.emailVerificationOTPExpires
  ) {
    throw new ServiceError(
      400,
      "OTP không hợp lệ. Vui lòng yêu cầu mã mới.",
    );
  }

  if (
    otpService.isExpired(
      user.emailVerificationOTPExpires,
    )
  ) {
    throw new ServiceError(
      400,
      "OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
    );
  }

  const valid =
    otpService.verifyOTP(
      otp,
      user.emailVerificationOTP,
    );

  if (!valid) {
    throw new ServiceError(
      400,
      "OTP không đúng",
    );
  }

  user.isEmailVerified = true;

  // OTP chỉ dùng một lần
  user.emailVerificationOTP =
    undefined;

  user.emailVerificationOTPExpires =
    undefined;

  user.emailVerificationOTPLastSentAt =
    undefined;

  /*
   * Giữ logic hiện tại của project.
   */
  if (
    user.age &&
    user.gender &&
    user.height &&
    user.weight &&
    user.goal
  ) {
    await createNutritionGoal(user);
  }

  await user.save();

  try {
    await emailService
      .sendVerificationSuccess(
        user.email,
        user.name,
      );
  } catch (error) {
    console.error(
      "Send verification success email failed:",
      error,
    );
  }

  return {
    user,
    safeUser: toSafeUser(user),
  };
}


/* =========================
   RESEND EMAIL OTP
========================= */

async function resendVerificationOTP(
  email,
) {
  return sendVerificationOTP(email);
}


/* =========================
   CHANGE PASSWORD
========================= */

async function changePassword(
  userId,
  currentPassword,
  newPassword,
) {
  const user =
    await User.findById(userId);

  if (!user) {
    throw new ServiceError(
      404,
      "User không tồn tại",
    );
  }

  const valid =
    await bcrypt.compare(
      currentPassword,
      user.password,
    );

  if (!valid) {
    throw new ServiceError(
      401,
      "Mật khẩu hiện tại không đúng",
    );
  }

  user.password =
    await bcrypt.hash(
      newPassword,
      10,
    );

  await user.save();

  return user;
}


/* =========================
   GET ME
========================= */

async function getMe(userId) {
  const user =
    await User.findById(userId).select(
      "-password " +
        "-resetPasswordOTP " +
        "-resetPasswordOTPExpires " +
        "-resetPasswordOTPVerified " +
        "-resetPasswordOTPLastSentAt " +
        "-emailVerificationOTP " +
        "-emailVerificationOTPExpires " +
        "-emailVerificationOTPLastSentAt",
    );

  if (!user) {
    throw new ServiceError(
      404,
      "User không tồn tại",
    );
  }

  return user;
}


module.exports = {
  signup,
  login,

  forgotPassword,
  verifyResetPasswordOTP,
  resetPassword,
  resendResetPasswordOTP,

  sendVerificationOTP,
  verifyEmail,
  resendVerificationOTP,

  changePassword,
  getMe,

  ServiceError,
};