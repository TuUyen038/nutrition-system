const crypto = require("crypto");

const OTP_EXPIRE_TIME = 10 * 60 * 1000; // 10 phút
const OTP_RESEND_COOLDOWN = 60 * 1000; // 1 phút

function generateOTP() {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

function hashOTP(otp) {
  return crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");
}

function verifyOTP(inputOTP, storedHash) {
  if (!inputOTP || !storedHash) {
    return false;
  }

  return hashOTP(inputOTP) === storedHash;
}

function getExpirationDate() {
  return new Date(
    Date.now() + OTP_EXPIRE_TIME,
  );
}

function isExpired(expiresAt) {
  if (!expiresAt) {
    return true;
  }

  return expiresAt.getTime() < Date.now();
}

function canResend(lastSentAt) {
  if (!lastSentAt) {
    return true;
  }

  const elapsed =
    Date.now() - lastSentAt.getTime();

  return elapsed >= OTP_RESEND_COOLDOWN;
}

function getRemainingCooldown(lastSentAt) {
  if (!lastSentAt) {
    return 0;
  }

  const elapsed =
    Date.now() - lastSentAt.getTime();

  const remaining =
    OTP_RESEND_COOLDOWN - elapsed;

  return Math.max(
    0,
    Math.ceil(remaining / 1000),
  );
}

module.exports = {
  generateOTP,
  hashOTP,
  verifyOTP,
  getExpirationDate,
  isExpired,
  canResend,
  getRemainingCooldown,
};