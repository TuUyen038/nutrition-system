const { withFallback } = require("../config/gemini.config");
const { getGeminiToolsForIntent } = require("./chatTools.definition");
const { executeTool } = require("./chatTools.executor");
const ragClient = require("./ragClient.service");
const ChatSession = require("../models/ChatSession");
const {
  GROUNDED_RULES,
  SourceRegistry,
  groundAnswer,
  stripGroundingArtifacts,
} = require("./grounding.service");

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DISCLAIMER =
  "Thông tin chỉ mang tính tham khảo. " +
  "Vui lòng tham khảo chuyên gia dinh dưỡng hoặc bác sĩ.";

const MAX_TOOL_STEPS = 8;

const SENSITIVE_KEYWORDS = [
  "bệnh", "thuốc", "điều trị", "chẩn đoán", "triệu chứng",
  "tiểu đường", "huyết áp", "tim mạch", "ung thư",
];

const SYSTEM_PROMPT = `
  Bạn là AI fitness assistant kết nối với hệ thống workout và nutrition thật.

  QUY TẮC:
  - Với kiến thức dinh dưỡng/vận động nói chung, PHẢI gọi rag_retrieve trước khi trả lời.
    Không trả lời kiến thức chung từ trí nhớ của bạn, kể cả khi bạn "biết" đáp án.
  - Với câu hỏi về trẻ em, ăn dặm, nhu cầu theo lứa tuổi hoặc khuyến nghị WHO/Bộ Y tế,
    PHẢI ưu tiên rag_retrieve; không được dùng search_ingredients.
  - Chỉ dùng search_ingredients khi user hỏi về MỘT nguyên liệu cụ thể như thịt gà,
    gạo hoặc trứng và cần dữ liệu dinh dưỡng trong database.
  - Không dùng database tools để trả lời kiến thức chung.
  - Không tự bịa, tạo AI text workout plan nếu chưa gọi tool
  - Đặc biệt với:
    + hôm nay tập gì
    + lịch tập
    + workout plan
    + tiến độ tập luyện
    + calories
    + bài tập hôm nay
  PHẢI gọi tool tương ứng.
  
  - Workout recommendation phải:
    + phù hợp thể trạng
    + phù hợp fatigue/recovery
    + an toàn cho user
  - Sau khi nhận dữ liệu từ tool:
    + giải thích tự nhiên
    + dễ hiểu
    + có động lực
  `;

const CHITCHAT_REPLIES = {
  greeting:
    "Xin chào! Mình có thể hỗ trợ bạn về dinh dưỡng, thực đơn và luyện tập.",
  thanks: "Không có gì! Mình luôn sẵn sàng hỗ trợ bạn.",
  goodbye: "Tạm biệt! Chúc bạn một ngày khỏe mạnh.",
  about_bot:
    "Mình là trợ lý NutriCare, có thể tra cứu kiến thức dinh dưỡng và dữ liệu ăn uống, luyện tập của bạn.",
  other: "Mình có thể giúp gì cho bạn về dinh dưỡng hoặc luyện tập?",
};

const OUT_OF_SCOPE_REPLY =
  "Xin lỗi, mình chỉ hỗ trợ các chủ đề về dinh dưỡng, thực đơn và luyện tập.";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const needsDisclaimer = (text = "") =>
  SENSITIVE_KEYWORDS.some((k) => text.toLowerCase().includes(k));

/**
 * Chuẩn hoá messages từ DB sang định dạng Gemini history.
 *
 * Gemini yêu cầu:
 *   - Xen kẽ user/model
 *   - Bắt đầu bằng "user"
 *   - Không có turn rỗng
 *
 * Giữ nguyên NỘI DUNG ĐẦY ĐỦ của mỗi message để Gemini có đủ
 * context khi user trả lời ngắn như "có", "được", "cái đầu tiên".
 */
const buildGeminiHistory = (messages = []) => {
  const filtered = messages.filter(
    (m) => m.content?.trim() && (m.role === "user" || m.role === "model")
  );
  if (!filtered.length) return [];

  // Gộp consecutive same-role (lấy cái cuối)
  const normalized = [];
  for (const msg of filtered) {
    const last = normalized[normalized.length - 1];
    if (last?.role === msg.role) {
      normalized[normalized.length - 1] = msg;
    } else {
      normalized.push(msg);
    }
  }

  // Phải bắt đầu bằng user
  if (normalized[0]?.role !== "user") normalized.shift();

  return normalized.map((m) => ({
    role: m.role,
    // Mã [Sx] được đánh lại mỗi lượt -> bỏ khỏi câu trả lời cũ để Gemini không trích nhầm
    parts: [{ text: m.role === "model" ? stripGroundingArtifacts(m.content) : m.content }],
  }));
};

/**
 * Ngày hôm nay theo giờ VN, format YYYY-MM-DD.
 * Inject vào mọi prompt để Gemini không dùng ngày từ training data.
 */
const getTodayVN = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

const buildUserContext = (ctx = {}) => {
  const parts = [];
  // Ngày giờ thực tế — luôn có mặt để Gemini không tự đoán
  parts.push(`Ngày hôm nay: ${getTodayVN()}`);
  if (ctx.age) parts.push(`Tuổi: ${ctx.age}`);
  if (ctx.gender) parts.push(`Giới tính: ${ctx.gender}`);
  if (ctx.height) parts.push(`Chiều cao: ${ctx.height}cm`);
  if (ctx.weight) parts.push(`Cân nặng: ${ctx.weight}kg`);
  if (ctx.goal) parts.push(`Mục tiêu: ${ctx.goal}`);
  if (ctx.allergies?.length) parts.push(`Dị ứng: ${ctx.allergies.join(", ")}`);
  return `[Thông tin user: ${parts.join(", ")}]`;
};

const buildResponse = (text, toolsUsed, userMessage, extra = {}) => {
  const usedSystemData = toolsUsed.some((t) => t.success);
  const attachDisclaimer =
    !usedSystemData || needsDisclaimer(userMessage) || needsDisclaimer(text);

  return {
    citations: extra.citations || [],
    grounding: extra.grounding || null,
    text: !usedSystemData
      ? `[Không tìm thấy dữ liệu trong hệ thống]\n\n${text}`
      : text,
    toolsUsed,
    dataSource: usedSystemData ? "hybrid" : "ai_generated",
    disclaimer: attachDisclaimer ? DISCLAIMER : null,
    hasDisclaimer: attachDisclaimer,
  };
};

const buildRuleResponse = (text) => ({
  text,
  toolsUsed: [],
  dataSource: "rule",
  disclaimer: null,
  hasDisclaimer: false,
});

async function classifyIntentSafe(userMessage) {
  try {
    const result = await ragClient.classify(userMessage);
    if (!result?.intent) return null;
    console.log("[IntentRouter]", {
      intent: result.intent,
      method: result.method,
    });
    return result;
  } catch (err) {
    console.warn("[IntentRouter] unavailable, using Gemini fallback:", err.message);
    return null;
  }
}

const handleFallback = async (chat, toolsUsed, userMessage, lastToolResult) => {
  // Nếu Gemini không tạo được câu trả lời sau khi tool đã chạy,
  // dùng ngay dữ liệu thật từ tool, không gọi Gemini thêm một lần nữa.
  if (lastToolResult) {
    const toolText =
      lastToolResult.summary ||
      (lastToolResult.data
        ? JSON.stringify(lastToolResult.data)
        : lastToolResult.error);

    if (toolText?.trim()) {
      return buildResponse(toolText, toolsUsed, userMessage);
    }
  }

  // Chỉ gọi Gemini bổ sung nếu không có dữ liệu tool để trả trực tiếp.
  if (toolsUsed.some((t) => t.success)) {
    try {
      const summary = await chat.sendMessage(
        "Dựa trên toàn bộ dữ liệu đã thu thập, hãy tổng hợp và trả lời câu hỏi ban đầu của người dùng."
      );
      const summaryText = summary.response.candidates?.[0]?.content?.parts
        ?.find((p) => p.text?.trim())?.text;
      if (summaryText?.trim()) {
        return buildResponse(summaryText, toolsUsed, userMessage);
      }
    } catch (_) {}
  }

  return {
    text: "Xin lỗi, tôi chưa thể xử lý yêu cầu này lúc này.",
    toolsUsed,
    disclaimer: DISCLAIMER,
    hasDisclaimer: true,
  };
};

// ─── CONTEXT RESOLVER ─────────────────────────────────────────────────────────

/**
 * Phát hiện short reply trong hội thoại ("có", "được", "cái đầu tiên"...).
 *
 * Với những message ngắn này, Gemini cần biết rõ context đang nói về gì
 * để không đi lạc sang chủ đề khác.
 *
 * Trả về instruction bổ sung để ghép vào finalPrompt.
 */
const SHORT_REPLY_PATTERNS = [
  /^(có|co|ok|oke|được|dc|yes|ừ|uh|uhm|vâng|dạ)$/i,
  /^(không|k|no|thôi|bỏ qua)$/i,
  /^(cái (đầu|1|2|3|4|5)|số (1|2|3|4|5)|mục (1|2|3|4|5))$/i,
  /^(tiếp|tiếp tục|next|continue)$/i,
  /^(thêm|thêm nữa|more)$/i,
];

const isShortReply = (message = "") =>
  SHORT_REPLY_PATTERNS.some((p) => p.test(message.trim()));
// ─── PENDING ACTION HELPERS ───────────────────────────────────────────────────

/**
 * Regex parse tag [PENDING_ACTION: tool | daily_menu_id: xxx | new_status: yyy]
 * do tool (ví dụ suggest_daily_menu) chèn vào cuối summary.
 */
const PENDING_ACTION_REGEX =
  /\[PENDING_ACTION:\s*([\w_]+)\s*\|\s*daily_menu_id:\s*([a-f0-9]{24})\s*\|\s*new_status:\s*(\w+)\]/;

const parsePendingAction = (summary = "") => {
  const match = summary.match(PENDING_ACTION_REGEX);
  if (!match) return null;
  return {
    tool: match[1],
    args: { daily_menu_id: match[2], new_status: match[3] },
  };
};

/**
 * Phân loại reply ngắn: đồng ý / từ chối / khác.
 * Dùng để quyết định có thực thi pendingAction hay không.
 */
const POSITIVE_REPLY_REGEX =
  /^(có|co|ok|oke|ừ|uh|uhm|vâng|dạ|đồng ý|dong y|chốt|lưu|được|dc|yes|tiếp|tiếp tục|next|continue)$/i;

const NEGATIVE_REPLY_REGEX =
  /^(không|k|no|thôi|bỏ qua|huỷ|hủy)$/i;

const classifyShortReply = (message = "") => {
  const trimmed = message.trim();
  if (POSITIVE_REPLY_REGEX.test(trimmed)) return "positive";
  if (NEGATIVE_REPLY_REGEX.test(trimmed)) return "negative";
  return "other";
};

/**
 * Lấy message model cuối cùng (có thể kèm pendingAction).
 */
const extractLastModelMessage = (messages = []) =>
  [...messages].reverse().find((m) => m.role === "model");

// ─── DIRECT PENDING ACTION EXECUTION ──────────────────────────────────────────

/**
 * Thực thi trực tiếp tool đã được "chốt" từ lượt trước (pendingAction),
 * KHÔNG đi qua agentic loop của Gemini — đảm bảo hành động chắc chắn xảy ra.
 *
 * Sau khi có kết quả tool, gọi Gemini (1 lần, không tool) để soạn câu trả lời
 * tự nhiên dựa trên kết quả đó.
 *
 * @returns {Object} cùng shape với _runGeminiWithTools (text, toolsUsed, dataSource, ...)
 */
async function _executeDirectAction(pendingAction, userMessage, userId) {
  const { tool, args } = pendingAction;
  const toolsUsed = [];

  let toolResult;
  try {
    toolResult = await executeTool(tool, args, userId);
    toolsUsed.push({ name: tool, args, success: toolResult?.success ?? true });
  } catch (err) {
    toolsUsed.push({ name: tool, args, success: false });
    toolResult = {
      success: false,
      error: err.message,
      summary: `Lỗi khi thực hiện ${tool}: ${err.message}`,
    };
  }

  // Nhờ Gemini soạn câu trả lời tự nhiên dựa trên kết quả tool — không cấp tool,
  // không cần history, chỉ cần 1 prompt ngắn → nhanh và rẻ.
  const phrasingPrompt =
    `User vừa xác nhận đồng ý ("${userMessage}") với hành động trước đó.\n` +
    `Hệ thống đã thực thi và trả về kết quả sau:\n` +
    `${toolResult.summary || JSON.stringify(toolResult)}\n\n` +
    `Hãy thông báo cho user kết quả này bằng tiếng Việt, ngắn gọn, ` +
    `tự nhiên, có động lực. Nếu success = false, xin lỗi và gợi ý hướng xử lý tiếp theo.`;

  try {
    const text = await withFallback(async (model) => {
      const chat = model.startChat({ history: [] });
      const result = await chat.sendMessage(phrasingPrompt);
      const part = result.response.candidates?.[0]?.content?.parts
        ?.find((p) => p.text?.trim());
      return part?.text?.trim();
    }, "chat");

    if (text) {
      return buildResponse(text, toolsUsed, userMessage);
    }
  } catch (err) {
    console.warn("[ChatService] Direct action phrasing failed:", err.message);
  }

  // Fallback nếu Gemini phrasing lỗi — dùng luôn summary của tool
  const fallbackText = toolResult.success
    ? toolResult.summary || "Đã thực hiện thành công."
    : `Xin lỗi, ${toolResult.summary || "có lỗi xảy ra khi xử lý yêu cầu."}`;

  return buildResponse(fallbackText, toolsUsed, userMessage);
}

/**
 * Lấy topic đang được thảo luận từ lượt model nói cuối cùng.
 * Dùng để nhắc Gemini nhớ context khi user trả lời ngắn.
 */
const extractLastTopic = (messages = []) => {
  const lastModel = [...messages].reverse().find((m) => m.role === "model");
  if (!lastModel) return null;
  // Trả về toàn bộ content (không cắt) để giữ pending_action tag
  return lastModel.content;
};


// ─── GEMINI AGENTIC LOOP ──────────────────────────────────────────────────────

/**
 * Thuần Gemini — không đụng DB.
 *
 * @param {Array}  history      - [{role, content}] từ DB (không bao gồm message hiện tại)
 * @param {string} userMessage  - Tin nhắn hiện tại của user
 * @param {Object} userContext  - Thông tin sức khoẻ
 * @param {string} userId       - ObjectId
 * @param {string|null} contextHint - Hint về topic đang thảo luận (cho short reply)
 */
async function _runGeminiWithTools(
  history,
  userMessage,
  userContext,
  userId,
  contextHint = null,
  routeInfo = null,
) {
  const contextText = buildUserContext(userContext);

  const shortReplyHint = contextHint
    ? `[Ngữ cảnh đang thảo luận: "${contextHint}..."]\n` +
      `[User đang phản hồi về chủ đề trên, KHÔNG phải yêu cầu mới]\n`
    : null;

  const routeHint = routeInfo?.intent
    ? `[Intent nhóm do router local xác định: ${routeInfo.intent}]\n` +
      "Hãy tự xác định sub-intent và chỉ chọn tool phù hợp với yêu cầu user."
    : null;

  const geminiTools = getGeminiToolsForIntent(routeInfo?.intent);
  const ragAvailable = geminiTools[0].functionDeclarations.some(
    (tool) => tool.name === "rag_retrieve",
  );

  const finalPrompt = [
    SYSTEM_PROMPT,
    ragAvailable ? GROUNDED_RULES : null,
    contextText,
    routeHint,
    shortReplyHint,
    userMessage,
  ]
    .filter(Boolean)
    .join("\n");

  const geminiHistory = buildGeminiHistory(history);
  const toolsUsed = [];
  const executedTools = new Set();
  let pendingAction = null; // ← THÊM
  let lastToolResult = null;
  let sources = new SourceRegistry();
  // Văn bản được phép chứa số liệu mà không cần nguồn RAG (dữ liệu của chính user)
  let personalTexts = [];
  console.log("[Gemini] Intent tools:", routeInfo?.intent || "fallback", {
    count: geminiTools[0].functionDeclarations.length,
    names: geminiTools[0].functionDeclarations.map((tool) => tool.name),
  });

  return withFallback(async (model) => {
    const chat = model.startChat({
      history: geminiHistory,
      tools: geminiTools,
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    });

    toolsUsed.length = 0;
    executedTools.clear();
    pendingAction = null; // reset mỗi lần retry
    lastToolResult = null;
    sources = new SourceRegistry();
    personalTexts = [];

    let result = await chat.sendMessage(finalPrompt);

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const parts = result.response.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length > 0) {
        const toolResponses = [];
        let anyNewTool = false;

        for (const part of functionCalls) {
          const { name, args } = part.functionCall;
          const dedupeKey = `${name}:${JSON.stringify(args)}`;

          if (executedTools.has(dedupeKey)) {
            console.log(`[Gemini] Skip duplicate: ${name}`);
            continue;
          }
          executedTools.add(dedupeKey);
          anyNewTool = true;
          console.log(`[Gemini] Tool: ${name}`, args);

          try {
            const toolResult = await executeTool(name, args, userId, { sources });
            lastToolResult = toolResult;
            if (name !== "rag_retrieve" && toolResult?.success !== false) {
              personalTexts.push(
                toolResult?.summary || JSON.stringify(toolResult?.data ?? "").slice(0, 4000),
              );
            }
            toolsUsed.push({ name, args, success: toolResult?.success ?? true });
            toolResponses.push({ functionResponse: { name, response: toolResult } });

            // ← THÊM: bắt pendingAction từ summary
            const parsed = parsePendingAction(toolResult?.summary || "");
            if (parsed) {
              pendingAction = parsed;
              console.log("[Gemini] Pending action detected:", pendingAction);
            }
          } catch (err) {
            console.error(`[Gemini] Tool error: ${name}`, err.message);
            toolsUsed.push({ name, args, success: false });
            toolResponses.push({
              functionResponse: {
                name,
                response: {
                  success: false,
                  error: err.message,
                  summary: `Lỗi khi thực hiện ${name}: ${err.message}`,
                },
              },
            });
            lastToolResult = {
              success: false,
              error: err.message,
              summary: `Lỗi khi thực hiện ${name}: ${err.message}`,
            };
          }
        }

        if (!anyNewTool) {
          console.warn("[Gemini] All duplicates, breaking");
          break;
        }

        // Function response phải được gửi như một message riêng.
        // Không truyền prompt ở argument thứ hai: argument đó chỉ là
        // request options của SDK, không phải instruction cho Gemini.
        result = await chat.sendMessage(toolResponses);
        continue;
      }

      const textPart = parts.find((p) => p.text?.trim());
      if (textPart?.text?.trim()) {
        console.log(`[Gemini] Done at step ${step}`);

        if (sources.ragCalled) {
          // Kiểm tra chống ảo giác: số liệu phải có trong nguồn, [Sx] phải tồn tại
          const grounded = await groundAnswer({
            chat,
            text: textPart.text,
            registry: sources,
            allowedContext: [
              userMessage,
              contextText,
              ...history.filter((m) => m.role === "user").slice(-3).map((m) => m.content),
              ...personalTexts,
            ],
          });
          return {
            ...buildResponse(grounded.text, toolsUsed, userMessage, grounded),
            pendingAction,
          };
        }

        return { ...buildResponse(textPart.text, toolsUsed, userMessage), pendingAction }; // ← SỬA
      }

      console.warn("[Gemini] No function calls and no text", {
        finishReason: result.response.candidates?.[0]?.finishReason,
        promptFeedback: result.response.promptFeedback,
        candidateCount: result.response.candidates?.length || 0,
      });
      break;
    }

    console.warn("Loop ended, attempting fallback");
    const fallback = await handleFallback(
      chat,
      toolsUsed,
      userMessage,
      lastToolResult,
    );
    return { ...fallback, pendingAction }; // ← SỬA
  }, "chat");
}

// ─── SESSION MANAGEMENT ───────────────────────────────────────────────────────

/**
 * Điểm vào chính cho controller.
 *
 * Flow:
 *   1. Tìm hoặc tạo session
 *   2. Detect short reply → extract context hint từ history nếu cần
 *   3. Lưu message user
 *   4. Build history → gọi Gemini
 *   5. Lưu response model → save session
 *   6. Trả về { sessionId, message, toolsUsed }
 */
async function sendChatWithTools(userId, userMessage, userContext, sessionId) {
  // 1. Tìm hoặc tạo session
  let session = sessionId
    ? await ChatSession.findOne({ _id: sessionId, userId, isActive: true })
    : null;

  if (!session) {
    session = new ChatSession({
      userId,
      userContext,
      title: userMessage.substring(0, 50),
      messages: [],
    });
  }

  // 2. Detect short reply + pendingAction từ lượt model trước
  let contextHint = null;
  let pendingActionFromLastTurn = null;
  let replyClass = "other";

  if (isShortReply(userMessage)) {
    const lastModel = extractLastModelMessage(session.messages);
    contextHint = lastModel?.content || null;
    pendingActionFromLastTurn = lastModel?.pendingAction || null;
    replyClass = classifyShortReply(userMessage);
    console.log(
      `[ChatService] Short reply detected (${replyClass}), ` +
      `pendingAction: ${JSON.stringify(pendingActionFromLastTurn)}`
    );
  }

  // 3. Lưu message user
  session.messages.push({ role: "user", content: userMessage });

  let geminiResult;

  // ── BRANCH: nếu có pendingAction + user đồng ý → thực thi trực tiếp ──
  if (pendingActionFromLastTurn && replyClass === "positive") {
    console.log("[ChatService] Executing pending action directly:", pendingActionFromLastTurn);
    geminiResult = await _executeDirectAction(
      pendingActionFromLastTurn,
      userMessage,
      userId
    );
  } else {
    // ── FLOW BÌNH THƯỜNG: agentic loop với Gemini ──

    // Nếu user từ chối pendingAction → không cần truyền pendingAction xuống,
    // nhưng vẫn giữ contextHint để Gemini hiểu là user đang nói về thực đơn vừa gợi ý.
    const historyForGemini = session.messages.slice(0, -1);
    session.trimMessages();

    const routeInfo = await classifyIntentSafe(userMessage);

    if (routeInfo?.intent === "chitchat") {
      const subIntent = routeInfo.sub_intent || "other";
      geminiResult = buildRuleResponse(
        CHITCHAT_REPLIES[subIntent] || CHITCHAT_REPLIES.other,
      );
    } else if (routeInfo?.intent === "out_of_scope") {
      geminiResult = buildRuleResponse(OUT_OF_SCOPE_REPLY);
    } else {
      // knowledge/personal/mixed: Gemini vẫn xác định sub-intent, chọn tool
      // và tạo câu trả lời. Router local chỉ giới hạn nhóm tool được cấp.
      geminiResult = await _runGeminiWithTools(
        historyForGemini,
        userMessage,
        userContext,
        userId,
        contextHint,
        routeInfo,
      );
    }
  }

  // 4. Lưu response model + save (kèm pendingAction nếu có)
  session.messages.push({
    role: "model",
    content: geminiResult.text,
    dataSource: geminiResult.dataSource,
    hasDisclaimer: geminiResult.hasDisclaimer,
    pendingAction: geminiResult.pendingAction || null, // ← THÊM
  });
  session.trimMessages();
  await session.save();

  return {
    sessionId: session._id,
    message: {
      role: "model",
      content: geminiResult.text,
      disclaimer: geminiResult.disclaimer,
      hasDisclaimer: geminiResult.hasDisclaimer,
      dataSource: geminiResult.dataSource,
      citations: geminiResult.citations || [],
      grounding: geminiResult.grounding || null,
    },
    toolsUsed: geminiResult.toolsUsed,
  };
}

// ─── SESSION CRUD ─────────────────────────────────────────────────────────────

async function getUserSessions(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const [sessions, total] = await Promise.all([
    ChatSession.find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("_id title createdAt updatedAt")
      .lean(),
    ChatSession.countDocuments({ userId, isActive: true }),
  ]);
  return {
    sessions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getSessionDetail(userId, sessionId) {
  return ChatSession.findOne({ _id: sessionId, userId, isActive: true }).lean();
}

async function deleteSession(userId, sessionId) {
  const result = await ChatSession.findOneAndUpdate(
    { _id: sessionId, userId },
    { isActive: false },
    { new: true }
  );
  return !!result;
}


// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  sendChatWithTools,
  getUserSessions,
  getSessionDetail,
  deleteSession,
  needsDisclaimer,
  DISCLAIMER,
};
