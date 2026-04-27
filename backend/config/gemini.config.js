const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY chưa được cấu hình trong .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = `Bạn là trợ lý dinh dưỡng thông minh của ứng dụng NutriCare.
Bạn có thể:
- Tư vấn dinh dưỡng, chế độ ăn uống dựa trên thông tin sức khỏe người dùng
- Nhận diện món ăn từ ảnh và ước tính calo
- Giải thích các chỉ số dinh dưỡng (calories, protein, carbs, fat...)
- Gợi ý thực đơn phù hợp với mục tiêu: lose_weight / maintain_weight / gain_weight
- Trả lời câu hỏi về các món ăn, nguyên liệu trong hệ thống

Nguyên tắc bắt buộc:
1. Luôn trả lời bằng tiếng Việt
2. Khi không chắc chắn hoặc thông tin từ AI (không từ DB), ghi rõ "[Tham khảo]" ở đầu câu đó
3. KHÔNG đưa ra chẩn đoán y tế, không khuyên dùng thuốc
4. Nếu người dùng hỏi về bệnh lý cụ thể, nhắc họ gặp bác sĩ/chuyên gia dinh dưỡng
5. Giữ câu trả lời súc tích, có cấu trúc rõ ràng`;

/**
 * Model cho chat hội thoại (có history)
 */
const getChatModel = () =>
  genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

/**
 * Model cho vision (nhận diện ảnh, không cần history)
 */
const getVisionModel = () =>
  genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      temperature: 0.3, // thấp hơn để kết quả ổn định hơn
      maxOutputTokens: 512,
    },
  });

module.exports = { getChatModel, getVisionModel };