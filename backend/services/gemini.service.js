const { getChatModel, getVisionModel } = require("../config/gemini.config");
const { GEMINI_TOOLS } = require("./chatTools.definition");
const { executeTool } = require("./chatTools.executor");

const DISCLAIMER =
  "⚠️ Thông tin trên chỉ mang tính tham khảo, có thể chưa chính xác. " +
  "Vui lòng tham khảo chuyên gia dinh dưỡng hoặc bác sĩ trước khi thay đổi chế độ ăn.";

// Từ khoá nhạy cảm cần gắn disclaimer
const SENSITIVE_KEYWORDS = [
  "bệnh", "thuốc", "điều trị", "chẩn đoán", "triệu chứng",
  "tiểu đường", "huyết áp", "tim mạch", "ung thư", "sỏi thận",
  "dị ứng nặng", "phẫu thuật", "toa", "liều lượng",
];

/**
 * Kiểm tra có cần gắn disclaimer không
 */
const needsDisclaimer = (text) => {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
};

/**
 * Chuyển messages từ DB sang format Gemini history
 * Gemini yêu cầu: mảng { role, parts: [{ text }] }
 * và phải bắt đầu bằng "user", xen kẽ user-model
 */
const buildGeminiHistory = (messages) => {
  // Lọc chỉ lấy text messages, bỏ empty
  const textMessages = messages.filter(
    (m) => m.content && m.content.trim() && 
           (m.role === "user" || m.role === "model")
  );

  if (!textMessages.length) return [];

  // Đảm bảo bắt đầu bằng "user"
  let startIdx = 0;
  while (startIdx < textMessages.length && textMessages[startIdx].role !== "user") {
    startIdx++;
  }
  const filtered = textMessages.slice(startIdx);

  // Đảm bảo xen kẽ đúng — nếu 2 msg liền nhau cùng role thì bỏ cái trước
  const alternating = [];
  for (const msg of filtered) {
    const last = alternating[alternating.length - 1];
    if (last && last.role === msg.role) {
      // Cùng role liền nhau → thay thế bằng cái mới hơn
      alternating[alternating.length - 1] = msg;
    } else {
      alternating.push(msg);
    }
  }

  // Bỏ message cuối nếu là "model"
  // (Gemini sẽ tự append response mới vào sau user message)
  if (alternating[alternating.length - 1]?.role === "model") {
    alternating.pop();
  }

  return alternating.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));
};


/**
 * Gửi tin nhắn text (có history để duy trì ngữ cảnh)
 * @param {Array} history - messages từ DB (trừ message hiện tại)
 * @param {string} userMessage - tin nhắn mới của user
 * @param {Object} userContext - { age, gender, height, weight, goal, allergies }
 * @param {Object|null} systemDbData - data từ DB nếu có (recipe, nutrition goal...)
 */
const sendChatMessage = async (
  history,
  userMessage,
  userContext,
  systemDbData = null
) => {
  const model = getChatModel();

  // Build prompt: nếu có data từ DB thì inject vào để Gemini dùng
  let finalPrompt = userMessage;

  if (userContext && Object.keys(userContext).length > 0) {
    const ctxParts = [];
    if (userContext.age) ctxParts.push(`Tuổi: ${userContext.age}`);
    if (userContext.gender) ctxParts.push(`Giới tính: ${userContext.gender}`);
    if (userContext.height) ctxParts.push(`Chiều cao: ${userContext.height}cm`);
    if (userContext.weight) ctxParts.push(`Cân nặng: ${userContext.weight}kg`);
    if (userContext.goal) ctxParts.push(`Mục tiêu: ${userContext.goal}`);
    if (userContext.allergies?.length)
      ctxParts.push(`Dị ứng: ${userContext.allergies.join(", ")}`);

    if (ctxParts.length > 0) {
      finalPrompt = `[Thông tin người dùng: ${ctxParts.join(", ")}]\n\n${userMessage}`;
    }
  }

  if (systemDbData) {
    finalPrompt =
      `[Dữ liệu từ hệ thống (đáng tin cậy): ${JSON.stringify(systemDbData)}]\n\n` +
      finalPrompt;
  }

  // Gemini cần history không rỗng và đúng định dạng
  const geminiHistory = buildGeminiHistory(history);

  const chat = model.startChat({
    history: geminiHistory,
  });

  const result = await chat.sendMessage(finalPrompt);
  const responseText = result.response.text();

  const isAiGenerated = !systemDbData;
  const attachDisclaimer =
    isAiGenerated || needsDisclaimer(userMessage) || needsDisclaimer(responseText);

  return {
    text: responseText,
    dataSource: systemDbData ? "hybrid" : "ai_generated",
    disclaimer: attachDisclaimer ? DISCLAIMER : null,
    hasDisclaimer: attachDisclaimer,
  };
};

/**
 * Nhận diện món ăn từ ảnh (base64)
 * @param {string} base64Image - ảnh đã encode base64
 * @param {string} mimeType - "image/jpeg" | "image/png" | "image/webp"
 * @param {boolean} withCalories - có tính calo không
 */
const recognizeFoodFromImage = async (
  base64Image,
  mimeType,
  withCalories = false
) => {
  const model = getVisionModel();

  const prompt = withCalories
    ? `Nhận diện món ăn trong ảnh và ước tính dinh dưỡng.
Trả về JSON hợp lệ (không có markdown, không có backtick):
{
  "foodName": "tên món ăn tiếng Việt",
  "confidence": "high | medium | low",
  "estimatedCalories": <số calo ước tính cho 1 khẩu phần>,
  "macros": {
    "protein": <gram>,
    "carbs": <gram>,
    "fat": <gram>
  },
  "servingSize": "mô tả khẩu phần (ví dụ: 1 tô 350g)",
  "notes": "ghi chú nếu không chắc chắn, hoặc null"
}`
    : `Nhận diện món ăn trong ảnh.
Trả về JSON hợp lệ (không có markdown, không có backtick):
{
  "foodName": "tên món ăn tiếng Việt",
  "confidence": "high | medium | low",
  "description": "mô tả ngắn về món ăn",
  "notes": "ghi chú nếu không chắc chắn, hoặc null"
}`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    },
  ]);

  const raw = result.response.text().trim();

  // Gemini đôi khi wrap trong ```json ... ``` — strip ra
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Nếu parse lỗi, trả về dạng text thô
    parsed = { foodName: raw, confidence: "low", notes: "Không thể parse JSON" };
  }

  return {
    ...parsed,
    dataSource: "ai_generated",
    disclaimer: DISCLAIMER,
    hasDisclaimer: true,
  };
};

/**
 * Gửi tin nhắn có Function Calling.
 * Gemini có thể gọi 0..N tools trước khi trả response cuối cùng.
 * Hỗ trợ multi-turn tool calls (tool gọi xong → Gemini dùng kết quả → trả lời).
 *
 * @param {Array}  history     - messages từ DB
 * @param {string} userMessage - tin nhắn mới
 * @param {Object} userContext - { age, gender, height, weight, goal, allergies }
 * @param {string} userId      - để executor gọi service đúng user
 * @returns {{ text, toolsUsed, dataSource, disclaimer }}
 */
const sendChatWithTools = async (history, userMessage, userContext, userId) => {
  const model = getChatModel(); // dùng getChatModel đã có

  // Build context prompt như cũ
  let finalPrompt = userMessage;
  if (userContext && Object.keys(userContext).length > 0) {
    const ctxParts = [];
    if (userContext.age) ctxParts.push(`Tuổi: ${userContext.age}`);
    if (userContext.gender) ctxParts.push(`Giới tính: ${userContext.gender}`);
    if (userContext.height) ctxParts.push(`Chiều cao: ${userContext.height}cm`);
    if (userContext.weight) ctxParts.push(`Cân nặng: ${userContext.weight}kg`);
    if (userContext.goal) ctxParts.push(`Mục tiêu: ${userContext.goal}`);
    if (userContext.allergies?.length)
      ctxParts.push(`Dị ứng: ${userContext.allergies.join(", ")}`);
    if (ctxParts.length > 0) {
      finalPrompt = `[Thông tin người dùng: ${ctxParts.join(", ")}]\n\n${userMessage}`;
    }
  }

  const geminiHistory = buildGeminiHistory(history); // dùng helper đã có

  const chat = model.startChat({
    history: geminiHistory,
    tools: GEMINI_TOOLS,
    // AUTO: Gemini tự quyết định có dùng tool hay không
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
  });

  const toolsUsed = [];
  let currentResult = await chat.sendMessage(finalPrompt);

  // ── Vòng lặp xử lý tool calls ──────────────────────────────────────────────
  // Gemini có thể gọi nhiều tools liên tiếp (vd: search_recipes → get_recipe_detail)
  // Tối đa 5 vòng để tránh infinite loop
  let iteration = 0;
  const MAX_ITERATIONS = 5;

  while (iteration < MAX_ITERATIONS) {
    const parts = currentResult.response.candidates?.[0]?.content?.parts || [];

    // Tìm tất cả function calls trong response hiện tại
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) break; // Không có tool call → Gemini đã trả lời xong

    // Thực thi tất cả tool calls (có thể có nhiều trong 1 lượt)
    const toolResults = await Promise.all(
      functionCalls.map(async (part) => {
        const { name, args } = part.functionCall;
        console.log(`[GeminiTools] Calling tool: ${name}`, args);

        const result = await executeTool(name, args, userId);
        toolsUsed.push({ name, args, success: result.success });

        return {
          functionResponse: {
            name,
            response: {
              // Gemini cần nhận kết quả dạng string hoặc object
              // Dùng summary để tối ưu token, data để Gemini có thể trích xuất chi tiết
              content: result.success
                ? JSON.stringify({ summary: result.summary, data: result.data })
                : JSON.stringify({ error: result.error }),
            },
          },
        };
      })
    );

    // Gửi kết quả tools trở lại cho Gemini để tạo response
    currentResult = await chat.sendMessage(toolResults);
    iteration++;
  }

  const responseText = currentResult.response.text();
  const usedSystemData = toolsUsed.some((t) => t.success);
  const dataSource = usedSystemData ? "hybrid" : "ai_generated";
  const attachDisclaimer =
    !usedSystemData || needsDisclaimer(userMessage) || needsDisclaimer(responseText);

  return {
    text: responseText,
    toolsUsed,
    dataSource,
    disclaimer: attachDisclaimer ? DISCLAIMER : null,
    hasDisclaimer: attachDisclaimer,
  };
};

module.exports = {
  sendChatMessage,
  sendChatWithTools,
  recognizeFoodFromImage,
  DISCLAIMER,
  needsDisclaimer,
};