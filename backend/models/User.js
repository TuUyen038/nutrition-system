const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true},
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    age: Number,
    gender: { type: String, enum: ["male", "female", "other"] },
    height: Number,
    weight: Number,
    goal: {
      type: String,
      enum: ["lose_weight", "maintain_weight", "gain_weight"],
    },
    fitnessLevel: {
      type: String,
      enum: ["sedentary", "beginner", "intermediate", "advanced", "athlete"],
      default: "sedentary",
    },
    allergies: [String],
    favoriteRecipes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Recipe",
      },
    ],
    resetPasswordOTP: String,
    resetPasswordOTPExpires: Date,
    resetPasswordOTPVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationOTP: String,
    emailVerificationOTPExpires: Date,

    /* --- CÁC TRƯỜNG SOFT DELETE & AUDIT LOG --- */
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletionReason: { type: String, default: null },
  },
  { timestamps: true },
);

// 1. Tạo Partial Index: Đảm bảo Email là duy nhất nhưng CHỈ đối với những người chưa bị xóa.
// Điều này cho phép một email đã xóa có thể được đăng ký lại mà không bị lỗi "Duplicate Key".
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

// 2. Query Middleware: Tự động lọc bỏ các user đã bị xóa khi dùng find, findOne, v.v...
userSchema.pre(/^find/, function (next) {
  // Nếu bạn muốn lấy cả user đã xóa (ví dụ trong trang Admin Audit),
  // hãy sử dụng User.find().withDeleted() (cần viết thêm custom method)
  this.where({ deletedAt: null });
  next();
});

module.exports = mongoose.model("User", userSchema);
