/**
 * Khai báo Function Calling tools cho Gemini.
 * Gemini sẽ đọc description để tự quyết định khi nào gọi tool nào.
 *
 * Nguyên tắc đặt tên:
 *  - động_từ_danh_từ (snake_case)
 *  - description phải rõ WHEN TO USE, không chỉ là WHAT IT DOES
 */
const CHAT_TOOLS = [
  // ─── INGREDIENT ───────────────────────────────────────────────────────────────
  {
    name: "search_ingredients",
    description:
      "Tìm kiếm nguyên liệu thực phẩm theo tên, xem thông tin dinh dưỡng chi tiết của một nguyên liệu. " +
      "Gọi khi user hỏi về nguyên liệu chưa qua chế biến: " +
      "'thịt gà có bao nhiêu protein', '100g gạo bao nhiêu calo', " +
    "'trứng gà dinh dưỡng như thế nào', 'rau cải chứa gì'. " +
    "CHỈ dùng khi X là NGUYÊN LIỆU ĐƠN LẺ (thịt, cá, rau, gạo...). " +
    "KHÔNG dùng khi X là tên món ăn đã chế biến (phở, bánh, cơm tấm...) — dùng search_recipes thay thế.",
    parameters: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description:
            "Tên nguyên liệu cần tìm, ví dụ: 'thịt gà', 'gạo', 'trứng'",
        },
        category: {
          type: "string",
          enum: [
            "protein",
            "carb",
            "fat",
            "vegetable",
            "fruit",
            "dairy",
            "seasoning",
            "beverage",
            "other",
          ],
          description: "Lọc theo nhóm thực phẩm (tuỳ chọn)",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "get_ingredient_detail",
    description:
      "Lấy thông tin dinh dưỡng chi tiết của một nguyên liệu theo ID. " +
      "Gọi sau search_ingredients khi cần thông tin đầy đủ hơn về một nguyên liệu cụ thể.",
    parameters: {
      type: "object",
      properties: {
        ingredient_id: {
          type: "string",
          description: "MongoDB ObjectId của nguyên liệu",
        },
      },
      required: ["ingredient_id"],
    },
  },

  // ─── EXERCISE ────────────────────────────────────────────────────────────────
  {
    name: "search_exercises",
    description:
      "Tìm kiếm bài tập thể dục phù hợp với mục tiêu hoặc nhóm cơ. " +
      "Gọi khi user hỏi 'bài tập giảm cân', 'tập gì cho cơ bụng', " +
      "'bài tập cardio', 'exercise cho người mới bắt đầu', 'tập tay bằng gì'. " +
      "KHÔNG gọi khi user chỉ hỏi về chế độ ăn uống thuần tuý.",
    parameters: {
      type: "object",
      properties: {
        category_id: {
          type: "number",
          description: "ID thể loại bài tập (tuỳ chọn)",
        },
        muscle_ids: {
          type: "string",
          description:
            "IDs nhóm cơ cách nhau dấu phẩy, ví dụ: '1,2,3' (tuỳ chọn)",
        },
        equipment_ids: {
          type: "string",
          description: "IDs thiết bị cách nhau dấu phẩy (tuỳ chọn)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_exercise_detail",
    description:
      "Lấy thông tin chi tiết một bài tập: mô tả, nhóm cơ, thiết bị cần, hình ảnh hướng dẫn. " +
      "Gọi sau search_exercises khi user muốn biết thêm về một bài tập cụ thể.",
    parameters: {
      type: "object",
      properties: {
        exercise_id: {
          type: "number",
          description: "exerciseId (số nguyên) của bài tập",
        },
      },
      required: ["exercise_id"],
    },
  },

  // ─── FAVORITE ────────────────────────────────────────────────────────────────
  {
    name: "get_favorite_recipes",
    description:
      "Lấy danh sách công thức món ăn yêu thích của user. " +
      "Gọi khi user hỏi 'món yêu thích của tôi', 'danh sách yêu thích', " +
      "'tôi đã lưu món gì', 'xem favorite của tôi'.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Số món muốn lấy, mặc định 10",
        },
      },
      required: [],
    },
  },
  {
    name: "add_favorite_recipe",
    description:
      "Thêm một công thức món ăn vào danh sách yêu thích của user. " +
      "Gọi khi user nói 'lưu món này', 'thêm vào yêu thích', 'tôi thích món X'. " +
      "Phải có recipe_id hợp lệ — nếu chưa có, gọi search_recipes trước.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "MongoDB ObjectId của recipe cần thêm vào yêu thích",
        },
      },
      required: ["recipe_id"],
    },
  },
  {
    name: "remove_favorite_recipe",
    description:
      "Xóa một công thức món ăn khỏi danh sách yêu thích của user. " +
      "Gọi khi user nói 'bỏ yêu thích', 'xóa khỏi danh sách', 'không thích món này nữa'. " +
      "Chỉ gọi khi user có ý định rõ ràng muốn xóa.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "MongoDB ObjectId của recipe cần xóa khỏi yêu thích",
        },
      },
      required: ["recipe_id"],
    },
  },
  // ─── RECIPE ──────────────────────────────────────────────────────────────────
  {
    name: "search_recipes",
    description:
      "Tìm kiếm công thức món ăn theo tên hoặc theo tên nguyên liệu có trong món ăn đó. " +
      "Gọi khi user hỏi về một MÓN ĂN CỤ THỂ: 'dinh dưỡng của món X', " +
    "'bánh bò bông bao nhiêu calo', 'phở bò có bao nhiêu protein', " +
    "'tìm món X', 'công thức X'," +
      "KHÔNG gọi khi user chỉ hỏi tư vấn chung về dinh dưỡng." +
      "Dùng tool này khi X là TÊN MÓN ĂN (phở, bánh, cơm, bún...). " +
    "KHÔNG dùng khi X là nguyên liệu thô như thịt gà, gạo, trứng — dùng search_ingredients thay thế.",
    parameters: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Từ khoá tìm kiếm: tên món ăn hoặc nguyên liệu chính",
        },
        limit: {
          type: "number",
          description: "Số kết quả tối đa, mặc định 5",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "get_recipe_detail",
    description:
      "Lấy chi tiết một món ăn theo ID: nguyên liệu, cách nấu, dinh dưỡng. Ví dụ: dinh dưỡng của món...; cách nấu món...; nguyên liệu món..." +
      "Gọi khi user muốn xem chi tiết hoặc sau khi search_recipes trả về kết quả.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "MongoDB ObjectId của recipe",
        },
      },
      required: ["recipe_id"],
    },
  },

  // ─── DAILY MENU ───────────────────────────────────────────────────────────────
  {
    name: "get_daily_menu",
    description:
      "Lấy thực đơn (daily menu) của user theo ngày. " +
      "Gọi khi user hỏi 'hôm nay ăn gì', 'thực đơn ngày X', 'kế hoạch ăn uống hôm nay'. " +
      "Dùng date = today nếu user không nêu ngày cụ thể.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Ngày cần lấy thực đơn, định dạng YYYY-MM-DD. Dùng ngày hôm nay nếu không được chỉ định.",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "add_recipe_to_daily_menu",
    description:
      "Thêm một món ăn vào thực đơn ngày của user. " +
      "Gọi khi user nói 'thêm món X vào thực đơn', 'tôi muốn ăn X hôm nay', 'lên thực đơn với X'. " +
      "Phải có recipe_id hợp lệ — nếu chưa có, gọi search_recipes trước.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "MongoDB ObjectId của recipe cần thêm",
        },
        date: {
          type: "string",
          description: "Ngày muốn thêm vào, định dạng YYYY-MM-DD",
        },
        serving_time: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack", "other"],
          description: "Bữa ăn: breakfast/lunch/dinner/snack/other",
        },
        scale: {
          type: "number",
          description: "Số khẩu phần, mặc định 1",
        },
      },
      required: ["recipe_id", "date"],
    },
  },
  {
    name: "suggest_daily_menu",
    description:
      "Yêu cầu AI gợi ý thực đơn tự động cho 1 ngày dựa trên mục tiêu dinh dưỡng của user. " +
      "Gọi khi user hỏi 'gợi ý thực đơn hôm nay', 'lên thực đơn cho tôi', 'ăn gì tốt cho mục tiêu của tôi'. " +
      "KHÔNG gọi nếu user chỉ muốn xem thực đơn đã có — dùng get_daily_menu thay thế.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Ngày cần gợi ý, định dạng YYYY-MM-DD",
        },
      },
      required: ["date"],
    },
  },

  // ─── MEAL PLAN ────────────────────────────────────────────────────────────────
  {
    name: "suggest_week_plan",
    description:
      "Gợi ý kế hoạch ăn uống cho cả tuần (7 ngày) và lưu vào hệ thống. " +
      "Gọi khi user hỏi 'lên kế hoạch ăn tuần này', 'gợi ý thực đơn tuần', 'meal plan 7 ngày'. " +
      "Tool này sẽ lưu thực đơn vào DB — cần user xác nhận trước khi gọi nếu có thể.",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description:
            "Ngày bắt đầu tuần, định dạng YYYY-MM-DD. Mặc định là hôm nay.",
        },
        days: {
          type: "number",
          description: "Số ngày cần lên kế hoạch, mặc định 7, tối đa 14",
        },
        save_to_db: {
          type: "boolean",
          description:
            "true = lưu vào DB, false = chỉ xem trước. Mặc định false để an toàn.",
        },
      },
      required: ["start_date"],
    },
  },

  // ─── NUTRITION GOAL ───────────────────────────────────────────────────────────
  {
    name: "get_nutrition_goal",
    description:
      "Lấy mục tiêu dinh dưỡng hiện tại (calories, protein, carbs, fat) của user. " +
      "Gọi khi user hỏi 'mục tiêu dinh dưỡng của tôi', 'tôi cần bao nhiêu calo', " +
      "'chỉ tiêu protein hôm nay', 'nhu cầu dinh dưỡng của tôi là gì'." +
      "một ngày nên nạp bao nhiêu ...",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  // ─── MEAL LOG ────────────────────────────────────────────────────────────────
  {
    name: "get_meal_history",
    description:
      "Lấy lịch sử ăn uống gần đây của user. " +
      "Gọi khi user hỏi 'tôi đã ăn gì', 'lịch sử ăn uống', 'tuần này tôi ăn gì rồi', " +
      "'hôm qua tôi ăn gì'.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Số ngày nhìn lại, mặc định 7",
        },
      },
      required: [],
    },
  },
];

/**
 * Format tools theo chuẩn Gemini Function Calling SDK
 * @see https://ai.google.dev/gemini-api/docs/function-calling
 */
const GEMINI_TOOLS = [
  {
    functionDeclarations: CHAT_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  },
];

module.exports = { CHAT_TOOLS, GEMINI_TOOLS };
