// aiInterface.js (Nâng cấp)
const { GeminiService } = require("./geminiProvider.js");

const GEMINI_API_KEY_FOOD = process.env.GEMINI_API_KEY;
const foodGeminiService = new GeminiService(
  GEMINI_API_KEY_FOOD,
  "gemini-2.5-flash",
);

const isQuotaError = (result) => {
  try {
    const parsed = JSON.parse(result);
    return (
      parsed.statusCode === 429 ||
      parsed.errorMessage?.includes("429") ||
      parsed.errorMessage?.includes("quota") ||
      parsed.errorMessage?.includes("RESOURCE_EXHAUSTED")
    );
  } catch (e) {
    return false;
  }
};

const analyzeWithFallback = async (
  imageFile,
  prompt,
  preferredModel = "gemini-2.5-flash",
) => {
  let result;
  let usedProvider = "unknown";
  let usedModel = "unknown";

  try {
    console.log("Bước 1/3: Đang thử Gemini Flash...");
    result = await foodGeminiService.analyze(
      imageFile,
      prompt,
      "gemini-2.5-flash",
    );

    if (isQuotaError(result)) {
      throw new Error("Quota exceeded");
    }

    // Thành công với Flash
    usedProvider = "gemini";
    usedModel = "gemini-2.5-flash";
    console.log(`Thành công với ${usedProvider} (${usedModel})`);
    return { result, provider: usedProvider, model: usedModel };
  } catch (error) {
    const isQuotaErr = isQuotaError(result);

    if (isQuotaErr) {
      console.warn("Gemini Flash hết quota (429), chuyển sang Flash-Lite...");
    } else {
      console.warn(
        `Gemini Flash lỗi: ${error.message}, chuyển sang Flash-Lite...`,
      );
    }
  }

  // Fallback sang Gemini Flash-Lite
  try {
    console.log("Bước 2/3: Đang thử Gemini Flash-Lite...");
    result = await foodGeminiService.analyze(
      imageFile,
      prompt,
      "gemini-2.5-flash-lite",
    );

    usedProvider = "gemini";
    usedModel = "gemini-2.5-flash-lite";
    console.log(`Thành công với ${usedProvider} (${usedModel})`);
    return { result, provider: usedProvider, model: usedModel };
  } catch (error) {
    if (isQuotaError(result)) {
      console.warn("Gemini Flash-Lite hết quota (429)");
    } else {
      console.warn(`Gemini Flash-Lite lỗi: ${error.message}`);
    }
  }

  const errorObject = {
    foodName: "Lỗi API/Không xác định",
    errorMessage:
      "Gemini Flash và Flash-Lite đều lỗi, Groq không được cấu hình",
    statusCode: 500,
    provider: "no_fallback",
  };
  return {
    result: JSON.stringify(errorObject),
    provider: "error",
    model: "none",
  };
};

//Nhận diện ảnh
const identifyFoodName = async (imageFile) => {
  const prompt = `
    Hãy nhận diện tất cả món ăn xuất hiện trong ảnh.

    - Chỉ trả về tên món ăn bằng tiếng Việt, món nào không biết thì bỏ qua không nêu.
    - Không giải thích.
    - Nếu không có món ăn thì trả về:
    {
      "foods": []
    }

    Chỉ trả về JSON:

    {
      "foods": [
        "Cơm trắng",
        "Thịt kho trứng",
        "Canh cải"
      ]
    }
    `;
  const { result, provider, model } = await analyzeWithFallback(
    imageFile,
    prompt,
    "gemini-2.5-flash",
  );
  return result;
};

const getRecipe = async (foodName) => {
  const prompt = `
    BẠN PHẢI TRẢ VỀ ĐÚNG FORMAT JSON SAU ĐÂY, KHÔNG ĐƯỢC THIẾU BẤT KỲ TRƯỜNG NÀO:

    Hãy cung cấp công thức nấu ăn thật đơn giản và dễ nấu cho món "${foodName}". 

    YÊU CẦU BẮT BUỘC:
    1. Trong công thức này, có nêu nguyên liệu và khối lượng tương ứng. Ví dụ "cho 200g thịt vào chảo".
    2. Tên nguyên liệu ưu tiên dựa vào Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng, 2017)
    3. Tất cả nguyên liệu lấy unit là gram (g)
    4. **BẮT BUỘC PHẢI CÓ TRƯỜNG "servings"** - số khẩu phần mà công thức này dành cho (ví dụ: 1, 2, 3, 4...)

    FORMAT JSON BẮT BUỘC (KHÔNG ĐƯỢC THIẾU TRƯỜNG NÀO):
    {
      "ingredients": [
        {
          "name": "cá hồi",
          "quantity": {
            "amount": 300,
            "unit": "g"
          }
        }
      ],
      "instructions": [
        "Ướp thịt với nước mắm, đường, tiêu...",
        "Nướng thịt đến khi chín vàng..."
      ],
      "servings": 1
    }`;
  const { result, provider, model } = await analyzeWithFallback(
    null,
    prompt,
    "gemini-2.5-flash",
  );

  // Validate và đảm bảo có servings
  try {
    const parsed = JSON.parse(result);
    if (!parsed.servings || parsed.servings === undefined) {
      console.warn("[getRecipe] Response thiếu servings, thêm mặc định = 1");
      parsed.servings = 1;
      return JSON.stringify(parsed);
    }
  } catch (e) {
    console.warn("[getRecipe] Không thể parse JSON để validate servings");
  }

  return result;
};

// Trích xuất danh sách nguyên liệu
const getIngredients = async (recipeInput) => {
  let recipeText = "";

  // Nếu FE gửi lên mảng các bước: ["Bước 1...", "Bước 2..."]
  if (Array.isArray(recipeInput)) {
    recipeText = recipeInput.join("\n");
  }
  // Nếu FE gửi lên string: "Bước 1...\nBước 2..."
  else if (typeof recipeInput === "string") {
    recipeText = recipeInput;
  }
  // Nếu FE gửi lên object recipe
  else if (recipeInput && typeof recipeInput === "object") {
    recipeText =
      recipeInput.instructionsText ||
      (Array.isArray(recipeInput.instructions)
        ? recipeInput.instructions.join("\n")
        : recipeInput.description || JSON.stringify(recipeInput));
  }

  const prompt = `
    Dựa trên Công thức nấu ăn sau:
    ${recipeText}

    Hãy trả về danh sách ingredients, có quantity và unit đầy đủ 
    (nếu công thức thiếu quantity thì tự ước lượng và sau đó gán thuộc tính estimate là true).

    Yêu cầu QUAN TRỌNG:
    - "name": tên nguyên liệu đơn giản, dễ hiểu
    - "quantity.amount": number (không được là string)
    - "quantity.unit": BẮT BUỘC phải là "g" (gram) cho TẤT CẢ các nguyên liệu
    - "quantity.estimate": boolean, true nếu là ước lượng

    Trả về 1 JSON object đúng format:
    {
      "ingredients": [
        {
          "name": "Thịt heo",
          "quantity": {
            "amount": 300,
            "unit": "g",
            "estimate": false
          }
        }
      ]
    }
  `
  const { result, provider, model } = await analyzeWithFallback(
    null,
    prompt,
    "gemini-2.5-flash",
  );
  return result;
};

/**
 * Gợi ý nguyên liệu thay thế cho những nguyên liệu không phù hợp với user
 * @param {Array} ingredientsToSubstitute - Danh sách nguyên liệu cần thay thế [{ingredient: {...}, reason: string, priority: string, reasonType: string}, ...]
 * @param {Array} allIngredients - Danh sách tất cả nguyên liệu (để AI hiểu context)
 * @param {String} userGoal - Mục tiêu của user (lose_weight, gain_weight, maintain_weight)
 * @param {String} instructions - Công thức nấu ăn (để AI giữ đúng cấu trúc món ăn)
 * @param {String} dishName - Tên món ăn (để AI hiểu loại món)
 * @returns {String} JSON string với format: {substitutions: [{original: "Thịt heo", reason: "...", suggestions: ["Đậu phụ", "Nấm"]}]}
 */
const getIngredientSubstitutions = async (
  ingredientsToSubstitute,
  allIngredients,
  userGoal,
  instructions = "",
  dishName = "",
) => {
  // Xử lý danh sách nguyên liệu cần thay thế
  if (!ingredientsToSubstitute || ingredientsToSubstitute.length === 0) {
    return JSON.stringify({ substitutions: [] });
  }

  const allIngredientsList = Array.isArray(allIngredients)
    ? allIngredients
        .map(
          (ing) =>
            `${ing.name}${ing.quantity?.amount ? ` (${ing.quantity.amount}${ing.quantity.unit || "g"})` : ""}`,
        )
        .join(", ")
    : "";

  const goalMap = {
    lose_weight: "giảm cân",
    gain_weight: "tăng cân",
    maintain_weight: "duy trì cân nặng",
    giam_can: "giảm cân",
    tang_co: "tăng cân",
    maintain: "duy trì cân nặng",
    can_bang: "duy trì cân nặng",
  };
  const goalText = goalMap[userGoal] || "duy trì sức khỏe";

  // Xác định mục tiêu thay thế dựa trên reasonType
  const reasonTypeMap = {
    allergy:
      "DỊ ỨNG - Buộc phải thay thế vì người dùng bị dị ứng với nguyên liệu này",
    calorie:
      "CALO CAO - Nguyên liệu này đóng góp quá nhiều calo so với mục tiêu hàng ngày",
    sodium: "NATRI CAO - Hàm lượng natri cao so với mục tiêu",
    sugar: "ĐƯỜNG CAO - Hàm lượng đường cao, không phù hợp với mục tiêu",
    fat: "CHẤT BÉO BÃO HÒA CAO - Quá nhiều chất béo bão hòa so với profile user",
    diet: "CHẾ ĐỘ ĂN - Không phù hợp với chế độ ăn của người dùng (ví dụ: ăn chay)",
  };

  const substitutionReasons = ingredientsToSubstitute
    .map((item) => {
      const reasonType = item.reasonType || "unknown";
      const reasonDesc = reasonTypeMap[reasonType] || item.reason;
      return `- ${item.ingredient.name}: ${reasonDesc}`;
    })
    .join("\n");

  // LOG: Thông tin gửi cho AI
  console.log(
    "[getIngredientSubstitutions] ===== THÔNG TIN GỬI CHO AI =====",
  );
  console.log(
    "ingredientsToSubstitute:",
    JSON.stringify(ingredientsToSubstitute, null, 2),
  );
  console.log(">>>allIngredients count:", allIngredients?.length || 0);
  console.log(">>>userGoal:", userGoal);
  console.log(">>>dishName:", dishName);
  console.log(">>>instructions length:", instructions?.length || 0);
  console.log(">>>substitutionReasons:", substitutionReasons);

  const prompt = `
    Bạn là một chuyên gia dinh dưỡng và ẩm thực. Hãy đưa ra gợi ý nguyên liệu thay thế cho những nguyên liệu KHÔNG PHÙ HỢP với người dùng.

    THÔNG TIN MÓN ĂN:
    ${dishName ? `- Tên món: ${dishName}` : ""}
    - Tất cả nguyên liệu trong món: ${allIngredientsList}
    ${instructions ? `- Công thức nấu:\n${instructions}` : ""}

    NGUYÊN LIỆU CẦN THAY THẾ VÀ LÝ DO:
    ${substitutionReasons}

    MỤC TIÊU CỦA NGƯỜI DÙNG: ${goalText}

    YÊU CẦU QUAN TRỌNG:
    1. **GIỮ ĐÚNG CẤU TRÚC MÓN ĂN**: 
      - Phải thay thế bằng nguyên liệu có chức năng tương tự trong món ăn
      - Ví dụ: Mì Ý phải thay bằng loại mì/pasta tương tự, KHÔNG được thay bằng mì tôm
      - Ví dụ: Thịt trong món thịt kho phải thay bằng protein tương tự (thịt khác hoặc đậu phụ), không thay bằng rau
      - Ví dụ: Nước dùng phải giữ nguyên loại (nước dùng gà, bò, chay), chỉ thay nguyên liệu tạo nước dùng

    2. **PHÙ HỢP VỚI LÝ DO THAY THẾ**:
      - Nếu lý do là DỊ ỨNG: Thay bằng nguyên liệu hoàn toàn khác, không chứa chất gây dị ứng
      - Nếu lý do là CALO CAO: Thay bằng nguyên liệu ít calo hơn nhưng vẫn giữ được hương vị và cấu trúc
      - Nếu lý do là NATRI/ĐƯỜNG/CHẤT BÉO CAO: Thay bằng nguyên liệu có hàm lượng thấp hơn
      - Nếu lý do là CHẾ ĐỘ ĂN (ăn chay): Thay thịt/cá bằng nguồn protein thực vật (đậu phụ, nấm, đậu, etc.)

    3. **TÊN NGUYÊN LIỆU**: 
      - Tên đơn giản, dễ hiểu, phổ biến
      - Không dùng tên kết hợp phức tạp (ví dụ: "Ức gà" thay vì "Ức gà không da")

    FORMAT JSON BẮT BUỘC:
    {
      "substitutions": [
        {
          "original": "Thịt heo",
          "reason": "Dị ứng: Nguyên liệu này chứa chất bạn bị dị ứng",
          "suggestions": ["Ức gà", "Đậu phụ", "Nấm hương"]
        },
        {
          "original": "Đường trắng",
          "reason": "Đường cao: Hàm lượng đường cao, không phù hợp với mục tiêu",
          "suggestions": ["Mật ong", "Đường thốt nốt"]
        }
      ]
    }

    LƯU Ý:
    - Chỉ trả về JSON, không có markdown code block
    - Nếu không thể thay thế được (ví dụ: món quá đặc thù), suggestions có thể là mảng rỗng []
    - QUAN TRỌNG: Phải giữ đúng cấu trúc và bản chất của món ăn
  `;

  const { result, provider, model } = await analyzeWithFallback(
    null,
    prompt,
    "gemini-2.5-flash",
  );
  // LOG: Kết quả từ AI
  console.log("[getIngredientSubstitutions] ===== KẾT QUẢ TỪ AI =====");
  console.log("Raw result:", result);
  try {
    const parsed = JSON.parse(result);
    console.log("Parsed result:", JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error("[getIngredientSubstitutions] Lỗi:", e.message);
  }

  return result;
};

module.exports = {
  identifyFoodName,
  getRecipe,
  getIngredients,
  getIngredientSubstitutions,
};
