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
    // Config cho user selection - tùy chọn, có thể dùng cho search tools khác
    userSelection: {
      enabled: true,
      displayField: "name",
      idField: "_id",
      detailToolName: "get_ingredient_detail",
      paramName: "ingredient_id",
      selectionPrompt:
        "Bạn muốn tìm hiểu về nguyên liệu nào trong danh sách trên?",
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
      "KHÔNG gọi khi user chỉ hỏi về chế độ ăn uống thuần tuý. Nếu user muốn biết chi tiết thì gọi đến hàm get_exercise_detail.",
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
    userSelection: {
      enabled: true,
      displayField: "name",
      idField: "exerciseId",
      detailToolName: "get_exercise_detail",
      paramName: "exercise_id",
      selectionPrompt: "Bạn muốn biết thêm về bài tập nào?",
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
      "Chỉ gọi khi user có ý định rõ ràng muốn xóa. Gọi get_favorite_recipes trước để biết món đó có trong danh sách yêu thích không và lấy recipe_id.",
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
    userSelection: {
      enabled: true,
      displayField: "name",
      idField: "_id",
      detailToolName: "get_recipe_detail",
      paramName: "recipe_id",
      selectionPrompt: "Bạn muốn xem thông tin chi tiết về món nào?",
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
      "Lấy thực đơn ngày của user theo ngày và trạng thái. " +
      "Gọi khi user hỏi 'hôm nay ăn gì', 'thực đơn ngày X', 'kế hoạch ăn uống hôm nay', " +
      "'xem thực đơn gợi ý', 'thực đơn tôi đang dùng'. " +
      "Dùng date = today nếu user không nêu ngày cụ thể. " +
      "status_filter: " +
      "'active' (mặc định) = manual + selected (thực đơn user đang dùng); " +
      "'suggested' = thực đơn hệ thống gợi ý chưa được chọn; ",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Ngày cần lấy thực đơn, định dạng YYYY-MM-DD. Dùng ngày hôm nay nếu không được chỉ định.",
        },
        status_filter: {
          type: "string",
          enum: ["active", "suggested"],
          description:
            "'active' = manual hoặc selected (mặc định, thực đơn user đang dùng); " +
            "'suggested' = chỉ thực đơn hệ thống gợi ý; ",
        },
      },
      required: ["date"],
    },
  },

  {
    name: "update_daily_menu_status",
    description:
      "Cập nhật trạng thái của thực đơn ngày (daily menu). " +
      "Gọi khi user nói 'hoàn thành thực đơn', 'đánh dấu menu hôm nay đã xong', 'Chọn thực đơn này', 'hoàn thành',..." +
      "PHẢI có daily_menu_id hợp lệ — nếu chưa có hoặc không chắc, " +
      "gọi get_daily_menu trước để lấy ID hiện tại. ",
    // "KHÔNG dùng ID từ lịch sử hội thoại cũ.",

    parameters: {
      type: "object",
      properties: {
        daily_menu_id: {
          type: "string",
          description: "MongoDB ObjectId của daily menu cần cập nhật",
        },
        new_status: {
          type: "string",
          enum: [
            "manual",
            "suggested",
            "selected",
            "completed",
            "deleted",
            "expired",
          ],
          description:
            "Trạng thái mới của thực đơn: manual/completed/suggested/selected/deleted/expired." +
            "Nếu user nói 'hoàn thành thực đơn', 'đánh dấu menu hôm nay đã xong' thì new_status = completed; " +
            "Nếu user nói kiểu: 'Chọn thực đơn này' thì new_status = selected; " +
            "Nếu user nói kiểu: 'hủy thực đơn này', 'xóa thực đơn này', 'không chọn thực đơn này nữa' thì new_status = deleted; " +
            "Nếu user nói kiểu: 'đây là thực đơn tôi tự tạo' thì new_status = manual.",
        },
      },
      required: ["daily_menu_id", "new_status"],
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
    name: "update_recipe_in_menu",
    description:
      "Cập nhật một món ăn trong thực đơn ngày: thay đổi số lượng khẩu phần (scale) hoặc đánh dấu đã ăn. " +
      "Gọi khi user nói 'tăng/giảm khẩu phần món X', 'đánh dấu đã ăn món X', " +
      "'tôi đã ăn món này rồi', 'chưa ăn món đó'. " +
      "PHẢI có daily_menu_id và recipe_item_id hợp lệ — " +
      "nếu chưa có hoặc không chắc, gọi get_daily_menu trước để lấy.",

    parameters: {
      type: "object",
      properties: {
        daily_menu_id: {
          type: "string",
          description: "MongoDB ObjectId của DailyMenu",
        },
        recipe_item_id: {
          type: "string",
          description: "_id của item trong mảng recipes (subdocument _id)",
        },
        new_scale: {
          type: "number",
          description:
            "Số khẩu phần mới. Truyền 0 hoặc số âm sẽ xoá món khỏi thực đơn. Bỏ qua nếu chỉ muốn cập nhật trạng thái checked.",
        },
        checked: {
          type: "boolean",
          description:
            "true = đánh dấu đã ăn (tạo MealLog), false = bỏ đánh dấu (xoá MealLog). Bỏ qua nếu chỉ muốn đổi scale.",
        },
      },
      required: ["daily_menu_id", "recipe_item_id"],
    },
  },
  {
    name: "delete_recipe_in_menu",
    description:
      "Xoá hoàn toàn một món ăn khỏi thực đơn ngày. " +
      "Gọi khi user nói 'xoá món X', 'bỏ món X ra khỏi thực đơn', 'không ăn món X nữa'. " +
      "Phân biệt với update_recipe_in_menu (dùng khi chỉ đổi scale/checked). " +
      "PHẢI có daily_menu_id hợp lệ — " +
      "nếu chưa có hoặc không chắc, gọi get_daily_menu trước để lấy.",
    parameters: {
      type: "object",
      properties: {
        daily_menu_id: {
          type: "string",
          description: "MongoDB ObjectId của DailyMenu",
        },
        recipe_item_id: {
          type: "string",
          description: "_id của item trong mảng recipes (subdocument _id)",
        },
      },
      required: ["daily_menu_id", "recipe_item_id"],
    },
  },
  {
    name: "suggest_daily_menu",
    description:
      "Yêu cầu hệ thống gợi ý thực đơn tự động cho 1 ngày dựa trên mục tiêu dinh dưỡng của user. " +
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
