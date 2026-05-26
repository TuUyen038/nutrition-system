const { GoogleGenerativeAI } = require("@google/generative-ai");

// ─── API KEYS ─────────────────────────────────────────────────────────────────

/**
 * Nhiều key để luân phiên khi gặp rate limit / lỗi.
 * Thêm key vào .env: GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3
 * Nếu chỉ có 1 key, dùng GEMINI_API_KEY làm fallback.
 */
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);

// Fallback về GEMINI_API_KEY nếu không có key nào ở trên
if (!API_KEYS.length && process.env.GEMINI_API_KEY) {
  API_KEYS.push(process.env.GEMINI_API_KEY);
}

if (!API_KEYS.length) {
  throw new Error("Chưa cấu hình GEMINI_API_KEY trong .env");
}

// ─── MODEL FALLBACK CHAIN ─────────────────────────────────────────────────────

/**
 * Thứ tự thử: primary → fallback 1 → fallback 2
 * Khi một key + model bị lỗi 429/503, thử key tiếp theo với cùng model.
 * Khi hết tất cả key, hạ xuống model tiếp theo trong chain.
 */
const MODEL_CHAIN = [
  "gemini-2.5-flash-lite",  // primary — nhanh, rẻ
  "gemini-2.5-flash",       // fallback 1 — mạnh hơn
  "gemini-2.0-flash",       // fallback 2 — last resort
];

/**
 * HTTP status / error code được coi là "nên thử lại với key/model khác".
 */
const RETRYABLE_ERRORS = new Set([
  429,   // Too Many Requests / rate limit
  503,   // Service Unavailable
  500,   // Internal Server Error (Gemini đôi khi trả về)
  "RESOURCE_EXHAUSTED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL",
]);

const isRetryable = (err) => {
  if (!err) return false;
  const status = err.status ?? err.httpStatus ?? err.code;
  if (RETRYABLE_ERRORS.has(status)) return true;
  const msg = (err.message ?? "").toUpperCase();
  return (
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("SERVICE_UNAVAILABLE") ||
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("RATE_LIMIT")
  );
};

// ─── SYSTEM INSTRUCTION ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `
Bạn là trợ lý dinh dưỡng thông minh của ứng dụng NutriCare.

## NGUYÊN TẮC SỬ DỤNG TOOLS

Với các chủ đề sau, PHẢI gọi tool TRƯỚC KHI trả lời — không tự trả lời từ kiến thức chung:

1. Nguyên liệu thực phẩm (thịt, cá, rau, gạo, trứng, sữa, bột...) → search_ingredients → get_ingredient_detail
2. Món ăn đã chế biến (phở, cơm, bánh mì, bún...) → search_recipes → get_recipe_detail
3. Thực đơn / kế hoạch ăn uống của user → get_daily_menu / suggest_daily_menu / suggest_week_plan
4. Chỉ số dinh dưỡng cá nhân / TDEE / nhu cầu calo → get_nutrition_goal
5. Bài tập thể dục → search_exercises → get_exercise_detail

Nếu tool trả về rỗng hoặc not found → dùng kiến thức chung, thêm tiền tố [Tham khảo bên ngoài].

## XỬ LÝ HỘI THOẠI LIÊN TỤC

Khi user trả lời ngắn ("có", "được", "ok", "cái đầu tiên", "tiếp tục"...):
- Đọc kỹ ngữ cảnh cuộc trò chuyện TRƯỚC ĐÓ
- Xác định user đang đề cập đến chủ đề gì từ lượt trước
- Tiếp tục đúng chủ đề đó, KHÔNG chuyển sang chủ đề mới
- Nếu có tag [Ngữ cảnh đang thảo luận: ...] trong message → đó là gợi ý về chủ đề hiện tại

Ví dụ:
- Lượt trước: "Bạn muốn xem chi tiết món nào?" → User: "cái đầu tiên" → Gọi detail của món đầu tiên
- Lượt trước: hỏi về đậu phụ → User: "có" → Tiếp tục về đậu phụ, không nhảy sang chủ đề khác

## CÁCH LÀM VIỆC (AGENTIC)

1. Xác định yêu cầu cần data gì
2. Gọi tool phù hợp
3. Đánh giá kết quả:
   - Danh sách → chọn item phù hợp → gọi detail
   - Detail đủ dùng → tổng hợp trả lời NGAY
   - Not found → dùng kiến thức chung + [Tham khảo bên ngoài]
4. Đủ data → DỪNG gọi tool → trả lời

## GIỚI HẠN

- KHÔNG gọi tool ngoài phạm vi yêu cầu (hỏi nguyên liệu → không gọi search_exercises)
- KHÔNG gọi lại tool đã gọi với cùng tham số
- KHÔNG gọi get_nutrition_goal trừ khi user hỏi về chỉ số cá nhân

## QUY TẮC CHUNG

- Luôn trả lời tiếng Việt, súc tích, có cấu trúc
- KHÔNG chẩn đoán y tế, không khuyên dùng thuốc
- Hỏi về bệnh lý → nhắc gặp bác sĩ
`.trim();

// ─── GENERATION CONFIG ────────────────────────────────────────────────────────

const CHAT_GENERATION_CONFIG = {
  temperature: 0.2,
  maxOutputTokens: 1024,
};

const VISION_GENERATION_CONFIG = {
  temperature: 0.3,
  maxOutputTokens: 512,
};

// ─── FACTORY HELPERS ──────────────────────────────────────────────────────────

const makeClient = (apiKey) => new GoogleGenerativeAI(apiKey);

const makeChatModel = (apiKey, modelName) =>
  makeClient(apiKey).getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: CHAT_GENERATION_CONFIG,
  });

const makeVisionModel = (apiKey, modelName) =>
  makeClient(apiKey).getGenerativeModel({
    model: modelName,
    generationConfig: VISION_GENERATION_CONFIG,
  });

// ─── RESILIENT EXECUTOR ───────────────────────────────────────────────────────

/**
 * Thực thi một Gemini operation với fallback tự động.
 *
 * Thứ tự thử:
 *   key_1 + model_0 → key_2 + model_0 → key_3 + model_0
 *   → key_1 + model_1 → key_2 + model_1 → key_3 + model_1
 *   → key_1 + model_2 → ...
 *
 * @param {Function} operation - async (model) => result
 *   Nhận Gemini model instance, trả về kết quả hoặc throw lỗi.
 * @param {"chat"|"vision"} type - loại model cần tạo
 * @returns {*} Kết quả từ operation thành công đầu tiên
 */
async function withFallback(operation, type = "chat") {
  const attempts = [];

  for (const modelName of MODEL_CHAIN) {
    for (const apiKey of API_KEYS) {
      const label = `[${modelName} / key ...${apiKey.slice(-6)}]`;
      try {
        const model =
          type === "vision"
            ? makeVisionModel(apiKey, modelName)
            : makeChatModel(apiKey, modelName);

        const result = await operation(model);
        console.log(`[Gemini] Success: ${label}`);
        return result;
      } catch (err) {
        const retryable = isRetryable(err);
        console.warn(
          `[Gemini] Failed ${label}: ${err.message} | retryable=${retryable}`
        );
        attempts.push({ label, error: err.message, retryable });

        // Lỗi không phải rate limit / unavailable → không cần thử key/model khác
        if (!retryable) throw err;
      }
    }
  }

  // Hết tất cả key + model
  const summary = attempts.map((a) => `${a.label}: ${a.error}`).join(" | ");
  const finalErr = new Error(`Tất cả key và model đều thất bại. ${summary}`);
  finalErr.allFailed = true;
  throw finalErr;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Tạo chat model với key + model đầu tiên khả dụng.
 * Dùng khi cần khởi tạo model để gọi startChat() trực tiếp.
 *
 * Với agentic loop (chat.service.js), dùng withFallback() thay thế
 * để tự động retry toàn bộ operation khi gặp lỗi.
 */
const getChatModel = () => makeChatModel(API_KEYS[0], MODEL_CHAIN[0]);

const getVisionModel = () => makeVisionModel(API_KEYS[0], MODEL_CHAIN[0]);

module.exports = {
  getChatModel,
  getVisionModel,
  withFallback,
  MODEL_CHAIN,
  API_KEYS,
  SYSTEM_INSTRUCTION,
  CHAT_GENERATION_CONFIG,
  VISION_GENERATION_CONFIG,
};