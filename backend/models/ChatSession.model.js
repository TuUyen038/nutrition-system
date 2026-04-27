const mongoose = require("mongoose");

// Schema cho từng tin nhắn trong cuộc hội thoại
const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "model"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: null, // URL ảnh trên Cloudinary nếu user gửi ảnh
    },
    // Nguồn gốc dữ liệu trong response
    dataSource: {
      type: String,
      enum: ["system_db", "ai_generated", "hybrid"],
      default: "ai_generated",
    },
    // Có gắn disclaimer không
    hasDisclaimer: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false, timestamps: false } // không cần _id riêng cho từng message
);

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Snapshot thông tin sức khỏe tại thời điểm tạo session
    // (dùng để build context prompt, không query lại User mỗi lần)
    userContext: {
      age: Number,
      gender: String,
      height: Number,
      weight: Number,
      goal: String,        // lose_weight / maintain_weight / gain_weight
      allergies: [String],
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    // Tiêu đề tự động lấy từ tin nhắn đầu tiên (truncate 50 chars)
    title: {
      type: String,
      default: "Cuộc trò chuyện mới",
      maxlength: 100,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Chỉ giữ tối đa 50 messages gần nhất để tránh document quá lớn
chatSessionSchema.methods.trimMessages = function () {
  if (this.messages.length > 50) {
    this.messages = this.messages.slice(-50);
  }
};

module.exports = mongoose.model("ChatSession", chatSessionSchema);