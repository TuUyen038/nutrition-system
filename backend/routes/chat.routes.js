const express = require("express");
const router = express.Router();
const multer = require("multer");

const chatController = require("../controllers/chat.controller");
const { authenticate } = require("../middlewares/auth");

// Dùng memoryStorage vì chỉ cần buffer để gửi sang Gemini
// Không lưu file xuống disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF"), false);
    }
  },
});

// Tất cả route chat đều cần auth
router.use(authenticate);

// POST /api/chat/message — gửi tin nhắn text
router.post("/message", chatController.sendMessage);

// POST /api/chat/image — gửi ảnh nhận diện món ăn
// ?calories=true để kèm ước tính calo
router.post("/image", upload.single("foodImage"), chatController.analyzeImage);

// GET /api/chat/sessions — danh sách hội thoại
router.get("/sessions", chatController.getSessions);

// GET /api/chat/sessions/:sessionId — chi tiết 1 hội thoại
router.get("/sessions/:sessionId", chatController.getSessionDetail);

// DELETE /api/chat/sessions/:sessionId — xóa hội thoại
router.delete("/sessions/:sessionId", chatController.deleteSession);

router.post("/message/v2", chatController.sendMessageV2);

module.exports = router;