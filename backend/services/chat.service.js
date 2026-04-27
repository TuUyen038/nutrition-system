const ChatSession = require("../models/ChatSession.model");
const { sendChatMessage } = require("./gemini.service");
const { sendChatWithTools } = require("./gemini.service");

/**
 * Lấy hoặc tạo session cho user
 * Mỗi user có thể có nhiều session (như các cuộc hội thoại khác nhau)
 */
const getOrCreateSession = async (userId, userContext, sessionId = null) => {
  if (sessionId) {
    const existing = await ChatSession.findOne({
      _id: sessionId,
      userId,
      isActive: true,
    });
    // Tìm thấy → dùng lại, KHÔNG tạo mới
    if (existing) return existing;
    // Không tìm thấy sessionId đó → tạo mới (tránh crash)
  }

  const session = await ChatSession.create({
    userId,
    userContext: { ...userContext },
    messages: [],
    title: "Cuộc trò chuyện mới",
  });

  return session;
};

/**
 * Xử lý tin nhắn text từ user
 */
const processTextMessage = async (userId, userMessage, userContext, sessionId = null) => {
  const session = await getOrCreateSession(userId, userContext, sessionId);

  // Lấy 10 messages gần nhất làm history (tránh context quá dài)
  const recentHistory = session.messages.slice(-10);

  // Gọi Gemini
  const aiResponse = await sendChatMessage(
    recentHistory,
    userMessage,
    session.userContext,
    null // không có systemDbData cho chat thuần
  );

  // Cập nhật title nếu là tin nhắn đầu tiên
  if (session.messages.length === 0) {
    session.title = userMessage.substring(0, 80) + (userMessage.length > 80 ? "..." : "");
  }

  // Lưu cả 2 messages vào session
  session.messages.push({
    role: "user",
    content: userMessage,
    dataSource: "system_db", // user message không cần disclaimer
    hasDisclaimer: false,
  });

  session.messages.push({
    role: "model",
    content: aiResponse.text,
    dataSource: aiResponse.dataSource,
    hasDisclaimer: aiResponse.hasDisclaimer,
  });

  session.trimMessages();
  await session.save();

  return {
    sessionId: session._id,
    message: {
      role: "model",
      content: aiResponse.text,
      dataSource: aiResponse.dataSource,
      disclaimer: aiResponse.disclaimer,
    },
  };
};

/**
 * Lấy danh sách sessions của user
 */
const getUserSessions = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    ChatSession.find({ userId, isActive: true })
      .select("title messages userContext createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ChatSession.countDocuments({ userId, isActive: true }),
  ]);

  // Chỉ trả về message cuối cùng cho preview
  const sessionsWithPreview = sessions.map((s) => ({
    ...s,
    lastMessage: s.messages[s.messages.length - 1] || null,
    messageCount: s.messages.length,
    messages: undefined, // bỏ full messages trong list
  }));

  return {
    sessions: sessionsWithPreview,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Lấy chi tiết 1 session (full messages)
 */
const getSessionDetail = async (userId, sessionId) => {
  const session = await ChatSession.findOne({
    _id: sessionId,
    userId,
    isActive: true,
  }).lean();

  if (!session) return null;
  return session;
};

/**
 * Xóa session (soft delete)
 */
const deleteSession = async (userId, sessionId) => {
  const session = await ChatSession.findOneAndUpdate(
    { _id: sessionId, userId },
    { isActive: false },
    { new: true }
  );
  return !!session;
};

/**
 * Xử lý tin nhắn với Function Calling (v2).
 * Thay thế processTextMessage khi muốn chatbot có khả năng thao tác hệ thống.
 */
const processTextMessageWithTools = async (
  userId,
  userMessage,
  userContext,
  sessionId = null
) => {
  const session = await getOrCreateSession(userId, userContext, sessionId);
  const recentHistory = session.messages.slice(-10);

  // LOG NÀY — xem session có đúng không
  console.log(`[Chat] sessionId: ${session._id}, messages count: ${session.messages.length}, isNew: ${session.messages.length === 0}`);
  console.log(`[Chat] History gửi lên Gemini: ${recentHistory.length} msgs`);

  // Gọi Gemini với tools
  const aiResponse = await sendChatWithTools(
    recentHistory,
    userMessage,
    session.userContext,
    userId
  );

  // Cập nhật title nếu là message đầu tiên
  if (session.messages.length === 0) {
    session.title =
      userMessage.substring(0, 80) + (userMessage.length > 80 ? "..." : "");
  }

  // Lưu messages
  session.messages.push({
    role: "user",
    content: userMessage,
    dataSource: "system_db",
    hasDisclaimer: false,
  });

  session.messages.push({
    role: "model",
    content: aiResponse.text,
    dataSource: aiResponse.dataSource,
    hasDisclaimer: aiResponse.hasDisclaimer,
  });

  session.trimMessages();
  await session.save();

  return {
    sessionId: session._id,
    message: {
      role: "model",
      content: aiResponse.text,
      dataSource: aiResponse.dataSource,
      disclaimer: aiResponse.disclaimer,
    },
    // Trả về tools đã dùng để frontend biết (hiện badge, icon...)
    toolsUsed: aiResponse.toolsUsed,
  };
};
module.exports = {
  getOrCreateSession,
  processTextMessage,
  processTextMessageWithTools,
  getUserSessions,
  getSessionDetail,
  deleteSession,
};