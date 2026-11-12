const API_BASE_URL = "http://localhost:8000";

/**
 * Gọi API batch search để lấy tên Việt + nutrition
 * @param {string[]} ingredientsArr - mảng tên nguyên liệu (ví dụ: ["thịt gà", "cà rốt"])
 * @param {number} topK - số kết quả trả về cho mỗi nguyên liệu
 * @returns {Promise<Array>} - trả về mảng kết quả
 */
export async function fetchIngredientsNutrition(ingredientsArr, topK = 5) {
  try {
    // Chuyển đổi mảng string sang định dạng API yêu cầu
    const payload = {
      ingredients: ingredientsArr.map((inObj) => ({
        // Semantic search phải dùng tên thô từ Gemini, không dùng tên chuẩn đã lưu.
        name: inObj.rawName || inObj.name || "",
      })),
      top_k: topK
    };

    console.groupCollapsed("[Mapping] Gọi search service");
    console.log("URL:", `${API_BASE_URL}/search_batch`);
    console.log("Payload:", payload);
    console.groupEnd();

    const response = await fetch(`${API_BASE_URL}/search_batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error("[Mapping] search service trả lỗi:", response.status, response.statusText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[Mapping] search service response:", data);
    return data.results; // mảng [{ input, results: [...] }, ...]
  } catch (error) {
    console.error("[Mapping] Không gọi được search service:", error);
    return [];
  }
}
