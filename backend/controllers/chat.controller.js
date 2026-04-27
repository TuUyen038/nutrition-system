const chatService = require("../services/chat.service");
const geminiService = require("../services/gemini.service");
const { processTextMessage, processTextMessageWithTools } = require("../services/chat.service");

const TOOL_TRIGGER_PATTERNS = [
  // Daily menu
  /thêm.*món|thêm.*vào.*thực đơn|thêm.*vào.*menu/i,
  /thực đơn.*(hôm nay|ngày|tuần)/i,
  /hôm nay.*(ăn gì|thực đơn)/i,
  /gợi ý.*thực đơn|lên.*thực đơn/i,
  // Meal plan
  /kế hoạch.*(ăn|tuần|tháng)/i,
  /meal.?plan|lên kế hoạch/i,
  /thực đơn.*(tuần|7 ngày)/i,
  // Nutrition goal
  /mục tiêu.*(dinh dưỡng|calo|kcal)/i,
  /calo.*(hôm nay|của tôi|mục tiêu)/i,
  /chỉ tiêu.*(protein|carb|fat)/i,
  // Meal history
  /lịch sử.*(ăn|bữa)/i,
  /tôi.*(đã ăn|ăn gì rồi)/i,
  /tuần này.*ăn/i,
  // Recipe
  /tìm.*(món|công thức|recipe)/i,
  /nấu.*(gì|món gì)/i,
  // Ingredient
  /dinh dưỡng.*(của|trong)|calo.*(của|trong|có)/i,
  /nguyên liệu.*(tìm|xem|tra|thông tin)/i,
  /thành phần.*(dinh dưỡng|calo|protein)/i,
  // Exercise
  /bài tập|tập thể dục|exercise|workout/i,
  /tập.*(gì|như thế nào|cho)|nhóm cơ/i,
  /cardio|strength|yoga|hiit/i,
  // Favorite
  /yêu thích|favorite|đã lưu/i,
  /thêm.*yêu thích|lưu.*món|bỏ.*yêu thích/i,
];

const needsTools = (message) =>
  TOOL_TRIGGER_PATTERNS.some((p) => p.test(message));

/**
 * POST /api/chat/message
 * mode: "auto" (default) | "tools" | "simple"
 *
 * auto   → phát hiện intent rồi tự chọn
 * tools  → ép dùng v2 (Function Calling)
 * simple → ép dùng v1 (chat thuần)
 */
exports.sendMessage = async (req, res) => {
  try {
    const { message, sessionId, mode = "auto" } = req.body;

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

    // Quyết định dùng tools hay không
    const useTools =
      mode === "tools" ||
      (mode === "auto" && needsTools(message.trim()));

    const result = useTools
      ? await processTextMessageWithTools(
          req.user._id, message.trim(), userContext, sessionId || null
        )
      : await processTextMessage(
          req.user._id, message.trim(), userContext, sessionId || null
        );

    return res.status(200).json({
      success: true,
      data: { ...result, usedTools: useTools },
    });
  } catch (error) {
    console.error("[Chat] sendMessage error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý tin nhắn: " + error.message,
    });
  }
};

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
    const mimeType = req.file.mimetype; // "image/jpeg" etc.
    const base64Image = req.file.buffer.toString("base64");

    const result = await geminiService.recognizeFoodFromImage(
      base64Image,
      mimeType,
      withCalories
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
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

    return res.status(200).json({
      success: true,
      data: result,
    });
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

    return res.status(200).json({
      success: true,
      data: session,
    });
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
 * Xóa session
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

    return res.status(200).json({
      success: true,
      message: "Đã xóa cuộc hội thoại",
    });
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
 * Phiên bản có Function Calling — chatbot có thể thao tác hệ thống
 */
exports.sendMessageV2 = async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
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

    const result = await processTextMessageWithTools(
      req.user._id,
      message.trim(),
      userContext,
      sessionId || null
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[Chat v2] sendMessageV2 error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý tin nhắn: " + error.message,
    });
  }
};