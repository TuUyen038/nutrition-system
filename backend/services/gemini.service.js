const {
  getChatModel,
  getVisionModel,
} = require("../config/gemini.config");

const { GEMINI_TOOLS } = require("./chatTools.definition");
const { executeTool } = require("./chatTools.executor");

const DISCLAIMER =
  "Thông tin chỉ mang tính tham khảo. " +
  "Vui lòng tham khảo chuyên gia dinh dưỡng hoặc bác sĩ.";

const MAX_TOOL_STEPS = 6;

const SENSITIVE_KEYWORDS = [
  "bệnh",
  "thuốc",
  "điều trị",
  "chẩn đoán",
  "triệu chứng",
  "tiểu đường",
  "huyết áp",
  "tim mạch",
  "ung thư",
];

const TOOL_PRIORITY_TOPICS = [
  "calo",
  "calories",
  "kcal",
  "protein",
  "carb",
  "fat",
  "tdee",
  "bmr",
  "thực đơn",
  "meal plan",
  "dinh dưỡng",
  "nguyên liệu",
  "món ăn",
  "bài tập",
];

const needsDisclaimer = (text = "") => {
  const lower = text.toLowerCase();

  return SENSITIVE_KEYWORDS.some((k) =>
    lower.includes(k)
  );
};

const shouldPreferTools = (message = "") => {
  const lower = message.toLowerCase();

  return TOOL_PRIORITY_TOPICS.some((k) =>
    lower.includes(k)
  );
};

const buildGeminiHistory = (messages = []) => {
  const filtered = messages.filter(
    (m) =>
      m.content &&
      (m.role === "user" || m.role === "model")
  );

  if (!filtered.length) return [];

  const normalized = [];

  for (const msg of filtered) {
    const last = normalized[normalized.length - 1];

    if (last?.role === msg.role) {
      normalized[normalized.length - 1] = msg;
    } else {
      normalized.push(msg);
    }
  }

  if (normalized[0]?.role !== "user") {
    normalized.shift();
  }

  return normalized.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));
};

const buildUserContext = (ctx = {}) => {
  const parts = [];

  if (ctx.age) parts.push(`Tuổi: ${ctx.age}`);
  if (ctx.gender) parts.push(`Giới tính: ${ctx.gender}`);
  if (ctx.height)
    parts.push(`Chiều cao: ${ctx.height}cm`);
  if (ctx.weight)
    parts.push(`Cân nặng: ${ctx.weight}kg`);
  if (ctx.goal)
    parts.push(`Mục tiêu: ${ctx.goal}`);

  if (ctx.allergies?.length) {
    parts.push(
      `Dị ứng: ${ctx.allergies.join(", ")}`
    );
  }

  return parts.length
    ? `[Thông tin user: ${parts.join(", ")}]`
    : "";
};

const SYSTEM_INSTRUCTION = `
Bạn là trợ lý AI dinh dưỡng.

QUY TẮC:
- Ưu tiên dùng tools/database cho:
  + calories
  + macros
  + ingredient nutrition
  + recipes
  + exercises
  + TDEE
  + meal plans
  + nutrition tracking

- Chỉ dùng kiến thức nền khi database không có dữ liệu.

- Khi đã đủ dữ liệu:
  + trả lời trực tiếp
  + KHÔNG gọi thêm tool không cần thiết

- Nếu tool trả về nhiều item:
  + tóm tắt ngắn gọn
  + yêu cầu user chọn

- Nếu không tìm thấy dữ liệu:
  + nói rõ dữ liệu hệ thống chưa có
  + mới dùng kiến thức nền
`;

async function sendChatWithTools(
  history,
  userMessage,
  userContext,
  userId
) {
  const model = getChatModel();

  const contextText =
    buildUserContext(userContext);

  const finalPrompt = [
    SYSTEM_INSTRUCTION,
    contextText,
    userMessage,
  ]
    .filter(Boolean)
    .join("\n\n");

  const geminiHistory =
    buildGeminiHistory(history);

  const preferTools =
    shouldPreferTools(userMessage);

  const chat = model.startChat({
    history: geminiHistory,

    tools: GEMINI_TOOLS,

    toolConfig: {
      functionCallingConfig: preferTools
        ? {
            mode: "ANY",
          }
        : {
            mode: "AUTO",
          },
    },
  });

  const toolsUsed = [];

  let result =
    await chat.sendMessage(finalPrompt);

  let step = 0;

  const executedTools = new Set();
while (step < MAX_TOOL_STEPS) {
  const parts =
    result.response.candidates?.[0]
      ?.content?.parts || [];

  // =========================
  // PRIORITY 1: TOOL CALLS
  // =========================

  const functionCalls = parts.filter(
    (p) => p.functionCall
  );

  // Nếu Gemini muốn gọi tool
  if (functionCalls.length > 0) {

    const toolResponses = [];

    for (const part of functionCalls) {
      const { name, args } =
        part.functionCall;

      const dedupeKey =
        `${name}:${JSON.stringify(args)}`;

      if (executedTools.has(dedupeKey)) {
        continue;
      }

      executedTools.add(dedupeKey);

      try {
        const toolResult =
          await executeTool(
            name,
            args,
            userId
          );

        toolsUsed.push({
          name,
          args,
          success:
            toolResult?.success ?? true,
        });

        toolResponses.push({
          functionResponse: {
            name,
            response: toolResult,
          },
        });

      } catch (err) {
        toolResponses.push({
          functionResponse: {
            name,
            response: {
              success: false,
              error: err.message,
            },
          },
        });
      }
    }

    // gửi kết quả tool lại cho Gemini
    result = await chat.sendMessage(
      toolResponses
    );

    step++;

    // loop tiếp
    continue;
  }

  // =========================
  // PRIORITY 2: FINAL TEXT
  // =========================

  const textPart = parts.find(
    (p) => p.text?.trim()
  );

  if (textPart?.text?.trim()) {

    const responseText =
      textPart.text;

    const usedSystemData =
      toolsUsed.some((t) => t.success);

    const attachDisclaimer =
      !usedSystemData ||
      needsDisclaimer(userMessage) ||
      needsDisclaimer(responseText);

    return {
      text:
        !usedSystemData &&
        preferTools
          ? `[Không tìm thấy dữ liệu trong hệ thống]\n\n${responseText}`
          : responseText,

      toolsUsed,

      dataSource:
        usedSystemData
          ? "hybrid"
          : "ai_generated",

      disclaimer:
        attachDisclaimer
          ? DISCLAIMER
          : null,

      hasDisclaimer:
        attachDisclaimer,
    };
  }

  // Không có tool, không có text
  break;
}

  // fallback
  return {
    text:
      "Xin lỗi, tôi chưa thể xử lý yêu cầu này lúc này.",

    toolsUsed,

    disclaimer: DISCLAIMER,

    hasDisclaimer: true,
  };
}

module.exports = {
  sendChatWithTools,
  needsDisclaimer,
  DISCLAIMER,
};