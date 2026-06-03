const chatService = require("../services/chat.service");
const geminiService = require("../services/gemini.service");

/**
 * POST /api/chat/image
 * Gửi ảnh để nhận diện món ăn
 * Body: multipart/form-data với field "foodImage"
 * Query: ?calories=true để tính calo
 */
exports.analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng upload ảnh món ăn",
      });
    }

    const withCalories = req.query.calories === "true";
    const result = await geminiService.recognizeFoodFromImage(
      req.file.buffer.toString("base64"),
      req.file.mimetype,
      withCalories
    );

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[Chat] analyzeImage error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi phân tích ảnh: " + error.message,
    });
  }
};

/**
 * GET /api/chat/sessions
 * Lấy danh sách sessions của user
 */
exports.getSessions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const result = await chatService.getUserSessions(req.user._id, page, limit);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[Chat] getSessions error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách hội thoại: " + error.message,
    });
  }
};

/**
 * GET /api/chat/sessions/:sessionId
 * Lấy chi tiết 1 session
 */
exports.getSessionDetail = async (req, res) => {
  try {
    const session = await chatService.getSessionDetail(
      req.user._id,
      req.params.sessionId
    );
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc hội thoại",
      });
    }
    return res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error("[Chat] getSessionDetail error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy hội thoại: " + error.message,
    });
  }
};

/**
 * DELETE /api/chat/sessions/:sessionId
 * Soft-delete session
 */
exports.deleteSession = async (req, res) => {
  try {
    const deleted = await chatService.deleteSession(
      req.user._id,
      req.params.sessionId
    );
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc hội thoại",
      });
    }
    return res.status(200).json({ success: true, message: "Đã xóa cuộc hội thoại" });
  } catch (error) {
    console.error("[Chat] deleteSession error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xóa hội thoại: " + error.message,
    });
  }
};

/**
 * POST /api/chat/message/v2
 * Chatbot có Function Calling — có thể truy vấn và thao tác hệ thống
 * Body: { message: string, sessionId?: string }
 */
exports.sendMessageV2 = async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tin nhắn không được để trống",
      });
    }

    const userContext = {
      age: req.user.age,
      gender: req.user.gender,
      height: req.user.height,
      weight: req.user.weight,
      goal: req.user.goal,
      allergies: req.user.allergies,
    };

    // Service tự lo: fetch history, gọi Gemini, save session
    const result = await chatService.sendChatWithTools(
      req.user._id,
      message.trim(),
      userContext,
      sessionId || null
    );

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[Chat v2] sendMessageV2 error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý tin nhắn: " + error.message,
    });
  }
};