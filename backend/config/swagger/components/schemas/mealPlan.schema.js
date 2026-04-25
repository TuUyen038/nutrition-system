module.exports = {
  // ─── MealPlan (summary, dùng trong list) ─────────────────────────────────────
  MealPlanSummary: {
    type: "object",
    description:
      "MealPlan rút gọn (dùng trong danh sách), dailyMenuIds chỉ có date + totalNutrition + status",
    properties: {
      _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
      userId: { type: "string", example: "663e1a2b3c4d5e6f7a8b9c0a" },
      startDate: {
        type: "string",
        format: "date",
        example: "2026-04-28",
      },
      endDate: { type: "string", format: "date", example: "2026-05-04" },
      source: {
        type: "string",
        enum: ["ai", "user"],
        description: "ai = do hệ thống gợi ý, user = tự tạo",
        example: "ai",
      },
      generatedBy: {
        type: "string",
        description: "Tên engine tạo plan (chỉ có khi source = ai)",
        example: "nutrition_ai_v2",
      },
      status: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
        example: "suggested",
      },
      dailyMenuIds: {
        type: "array",
        description:
          "Danh sách DailyMenu rút gọn (chỉ date, totalNutrition, status)",
        items: { $ref: "#/components/schemas/DailyMenuSummary" },
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },

  // ─── MealPlan (full, dùng trong detail) ──────────────────────────────────────
  MealPlan: {
    type: "object",
    description: "MealPlan đầy đủ (không populate recipe)",
    properties: {
      _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
      userId: { type: "string", example: "663e1a2b3c4d5e6f7a8b9c0a" },
      startDate: {
        type: "string",
        format: "date",
        example: "2026-04-28",
      },
      endDate: { type: "string", format: "date", example: "2026-05-04" },
      source: { type: "string", enum: ["ai", "user"], example: "user" },
      generatedBy: { type: "string", example: "nutrition_ai_v2" },
      status: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
        example: "manual",
      },
      dailyMenuIds: {
        type: "array",
        items: { type: "string" },
        description: "Mảng ObjectId của DailyMenu",
        example: ["664f1a2b3c4d5e6f7a8b9c01", "664f1a2b3c4d5e6f7a8b9c02"],
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },

  // ─── MealPlanDetail (populate đầy đủ) ────────────────────────────────────────
  MealPlanDetail: {
    type: "object",
    description: "MealPlan với DailyMenu và Recipe populate đầy đủ",
    properties: {
      _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
      userId: { type: "string", example: "663e1a2b3c4d5e6f7a8b9c0a" },
      startDate: {
        type: "string",
        format: "date",
        example: "2026-04-28",
      },
      endDate: { type: "string", format: "date", example: "2026-05-04" },
      source: { type: "string", enum: ["ai", "user"], example: "ai" },
      generatedBy: { type: "string", example: "nutrition_ai_v2" },
      status: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
        example: "suggested",
      },
      dailyMenuIds: {
        type: "array",
        description: "DailyMenu đã populate đầy đủ Recipe",
        items: { $ref: "#/components/schemas/DailyMenuDetail" },
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },

  // ─── DailyMenuSummary (dùng trong MealPlanSummary) ───────────────────────────
  DailyMenuSummary: {
    type: "object",
    properties: {
      _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c01" },
      date: { type: "string", format: "date", example: "2026-04-28" },
      status: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
        example: "suggested",
      },
      totalNutrition: { $ref: "#/components/schemas/Nutrition" },
    },
  },

  // ─── DailyMenuDetail (populate recipe, dùng trong MealPlanDetail) ────────────
  DailyMenuDetail: {
    type: "object",
    properties: {
      _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c01" },
      date: { type: "string", format: "date", example: "2026-04-28" },
      status: {
        type: "string",
        enum: [
          "manual",
          "suggested",
          "selected",
          "completed",
          "deleted",
          "expired",
        ],
        example: "suggested",
      },
      totalNutrition: { $ref: "#/components/schemas/Nutrition" },
      targetNutrition: { $ref: "#/components/schemas/Nutrition" },
      recipes: {
        type: "array",
        items: { $ref: "#/components/schemas/RecipeItem" },
      },
      feedback: {
        type: "string",
        example: "Ổn, nhưng muốn đổi bữa sáng",
      },
    },
  },

  // ─── Request schemas ──────────────────────────────────────────────────────────
  CreateMealPlanRequest: {
    type: "object",
    required: ["startDate"],
    properties: {
      startDate: {
        type: "string",
        format: "date",
        description: "Ngày bắt đầu plan (YYYY-MM-DD)",
        example: "2026-04-28",
      },
      period: {
        type: "string",
        enum: ["week"],
        default: "week",
        description: "Hiện tại chỉ hỗ trợ 'week' (7 ngày)",
        example: "week",
      },
    },
  },

  RecommendWeekRequest: {
    type: "object",
    properties: {
      startDate: {
        type: "string",
        format: "date",
        description: "Ngày bắt đầu gợi ý (YYYY-MM-DD). Mặc định là hôm nay.",
        example: "2026-04-28",
      },
      days: {
        type: "integer",
        minimum: 1,
        maximum: 14,
        default: 7,
        description: "Số ngày cần gợi ý (1–14, mặc định 7)",
        example: 7,
      },
      saveToDB: {
        type: "boolean",
        default: true,
        description: `Có lưu kết quả vào DB không.
- \`true\` (mặc định): Tạo DailyMenu + MealPlan, trả về data + planId để frontend dùng tiếp
- \`false\`: Chỉ tính toán, không lưu — dùng để preview trước khi confirm`,
        example: true,
      },
    },
  },

  // ─── WeekRecommendationResult ─────────────────────────────────────────────────
  WeekRecommendationResult: {
    type: "object",
    description: "Kết quả gợi ý thực đơn tuần từ AI",
    properties: {
      startDate: {
        type: "string",
        format: "date-time",
        example: "2026-04-28T00:00:00.000Z",
      },
      endDate: {
        type: "string",
        format: "date-time",
        example: "2026-05-04T00:00:00.000Z",
      },
      goal: {
        type: "string",
        description: "Mục tiêu dinh dưỡng của user",
        example: "maintain_weight",
      },
      tdee: {
        type: "number",
        description: "Tổng năng lượng tiêu hao hàng ngày (kcal)",
        example: 2396,
      },
      dailyTarget: {
        $ref: "#/components/schemas/Nutrition",
      },
      weekPlan: {
        type: "array",
        items: { $ref: "#/components/schemas/DayPlan" },
      },
      weeklyTotal: { $ref: "#/components/schemas/NutritionSimple" },
      weeklyAverage: { $ref: "#/components/schemas/NutritionSimple" },
    },
  },

  // ─── DayPlan (1 ngày trong WeekRecommendationResult) ─────────────────────────
  DayPlan: {
    type: "object",
    properties: {
      dayIndex: {
        type: "integer",
        description: "Thứ tự ngày (1–7)",
        example: 1,
      },
      date: {
        type: "string",
        format: "date-time",
        example: "2026-04-28T00:00:00.000Z",
      },
      recipes: {
        type: "array",
        description: "Danh sách món ăn flat, phân biệt bữa qua servingTime",
        items: { $ref: "#/components/schemas/RecipeItem" },
      },
      totalNutrition: { $ref: "#/components/schemas/NutritionSimple" },
      targetNutrition: { $ref: "#/components/schemas/Nutrition" },
    },
  },
};
