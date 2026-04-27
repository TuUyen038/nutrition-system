module.exports = {
  "/meal-plans": {
    get: {
      tags: ["Meal Plans"],
      summary: "Lấy danh sách MealPlan của user",
      description: `Trả về tất cả MealPlan của user đang đăng nhập, sắp xếp theo startDate mới nhất.
Mỗi plan bao gồm danh sách DailyMenu (chỉ có date, totalNutrition, status — không populate recipe chi tiết).
 
**Dùng khi:** Hiển thị lịch sử / danh sách các tuần đã tạo plan.
 
**Filter theo status (query param):**
- \`suggested\` — plan do AI gợi ý, chưa được user chọn
- \`selected\` — plan đang được áp dụng
- \`completed\` — plan đã hoàn thành
- \`manual\` — plan user tự tạo
- \`deleted\` — đã xóa mềm
- \`expired\` — bị expire khi user chọn plan khác cùng thời gian`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "status",
          schema: {
            type: "string",
            enum: [
              "manual",
              "suggested",
              "selected",
              "completed",
              "deleted",
              "expired",
            ],
          },
          required: false,
          description: "Lọc theo trạng thái plan. Không truyền = lấy tất cả.",
          example: "selected",
        },
      ],
      responses: {
        200: {
          description: "Danh sách MealPlan",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/MealPlanSummary" },
                  },
                },
              },
            },
          },
        },
        401: {},
      },
    },

    // ─── POST /mealplans ────────────────────────────────────────────────────────
    post: {
      tags: ["Meal Plans"],
      summary: "Tạo MealPlan thủ công",
      description: `Tạo 1 MealPlan do user tự lên lịch (không dùng AI).
 
**Logic xử lý:**
- Sinh danh sách ngày từ \`startDate\` theo \`period\` (mặc định 7 ngày)
- Mỗi ngày: nếu đã có DailyMenu (status là selected hoặc manual) → reuse; chưa có → tạo DailyMenu rỗng
- Trả về MealPlan với \`source: "user"\`, \`status: "manual"\`
 
**Sau khi tạo xong**, dùng API của DailyMenu (\`POST /dailymenus/add-recipe\`) để thêm món vào từng ngày.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateMealPlanRequest" },
            example: {
              startDate: "2026-04-28",
              period: "week",
            },
          },
        },
      },
      responses: {
        201: {
          description: "MealPlan đã được tạo thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
          },
        },
        400: {},
        401: {},
      },
    },
  },
  // ─── GET /mealplans/by-startdate ─────────────────────────────────────────────
  "/meal-plans/by-startdate": {
    get: {
      tags: ["Meal Plans"],
      summary: "Lấy MealPlan theo ngày bắt đầu",
      description: `Tìm MealPlan của user theo \`startDate\`. Trả về plan đầu tiên khớp (populate đầy đủ DailyMenu + Recipe chi tiết).
 
**Dùng khi:** User mở màn hình xem thực đơn tuần, frontend biết startDate của tuần hiện tại.
 
> ⚠️ Nếu không tìm thấy plan → trả về 404. Frontend nên gọi \`GET /mealplans/status\` trước để check.`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "startDate",
          schema: { type: "string", format: "date" },
          required: true,
          description: "Ngày bắt đầu của plan (YYYY-MM-DD)",
          example: "2026-04-28",
        },
      ],
      responses: {
        200: {
          description: "MealPlan với đầy đủ DailyMenu và Recipe",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/MealPlanDetail" },
                },
              },
            },
          },
        },
        400: {},
        401: {},
        404: {},
      },
    },
  },
  // ─── GET /mealplans/status ───────────────────────────────────────────────────
  "/meal-plans/status": {
    get: {
      tags: ["Meal Plans"],
      summary: "Kiểm tra tuần đã có DailyMenu chưa",
      description: `Kiểm tra xem trong khoảng N ngày từ \`startDate\`, ngày nào đã có DailyMenu tồn tại.
 
**Dùng khi:** Trước khi gọi AI gợi ý tuần (\`POST /mealplans/recommendations/week\`), frontend nên gọi API này để:
- Nếu \`hasExisting: false\` → gọi AI luôn
- Nếu \`hasExisting: true\` → hiển thị cảnh báo "Một số ngày đã có thực đơn, bạn có muốn tạo mới không?"
 
> ℹ️ API gợi ý AI sẽ **luôn tạo DailyMenu mới** (không reuse), nên cần confirm với user trước.`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "startDate",
          schema: { type: "string", format: "date" },
          required: true,
          description: "Ngày bắt đầu kiểm tra (YYYY-MM-DD)",
          example: "2026-04-28",
        },
        {
          in: "query",
          name: "days",
          schema: { type: "integer", default: 7, minimum: 1, maximum: 14 },
          required: false,
          description: "Số ngày cần kiểm tra (mặc định 7)",
          example: 7,
        },
      ],
      responses: {
        200: {
          description: "Kết quả kiểm tra",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      hasExisting: {
                        type: "boolean",
                        description:
                          "true nếu có ít nhất 1 ngày đã có DailyMenu",
                        example: true,
                      },
                      existingDates: {
                        type: "array",
                        items: { type: "string", format: "date" },
                        description: "Danh sách ngày đã có DailyMenu",
                        example: ["2026-04-28", "2026-04-29"],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: {},
        401: {},
      },
    },
  },
  // ─── GET /mealplans/:planId ──────────────────────────────────────────────────
  "/meal-plans/{planId}": {
    get: {
      tags: ["Meal Plans"],
      summary: "Lấy chi tiết MealPlan theo ID",
      description: `Trả về đầy đủ thông tin MealPlan: populate tất cả DailyMenu và Recipe trong từng ngày.
 
**Dùng khi:** Xem chi tiết 1 plan cụ thể (ví dụ sau khi AI gợi ý xong, hiển thị để user review trước khi chọn).`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "planId",
          schema: { type: "string" },
          required: true,
          description: "MongoDB ObjectId của MealPlan",
          example: "664f1a2b3c4d5e6f7a8b9c0d",
        },
      ],
      responses: {
        200: {
          description: "Chi tiết MealPlan",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/MealPlanDetail" },
                },
              },
            },
          },
        },
        400: {},
        401: {},
        404: {},
      },
    },
  },
  // ─── PATCH /mealplans/:planId/status ─────────────────────────────────────────
  "/meal-plans/{planId}/status": {
    patch: {
      tags: ["Meal Plans"],
      summary: "Cập nhật trạng thái MealPlan",
      description: `Cập nhật status của MealPlan.
 
**Luồng status thông thường:**
\`\`\`
suggested → selected → completed
manual    → selected → completed
\`\`\`
 
**Ràng buộc quan trọng:**
- Không thể cập nhật plan đã ở trạng thái \`completed\` hoặc \`deleted\`
- Khi chuyển sang \`selected\`: các plan \`suggested\` khác của cùng user bị **overlap thời gian** sẽ tự động chuyển sang \`expired\`
 
**Các giá trị status hợp lệ:**
 
| Status | Ý nghĩa |
|--------|---------|
| \`manual\` | Plan thủ công, chưa hoàn thiện |
| \`suggested\` | AI vừa gợi ý, chờ user xem xét |
| \`selected\` | User đã chọn plan này để thực hiện |
| \`completed\` | Đã hoàn thành toàn bộ plan |
| \`deleted\` | Đã xóa mềm (dùng DELETE thay vì PATCH) |
| \`expired\` | Hết hạn do user chọn plan khác |`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "planId",
          schema: { type: "string" },
          required: true,
          description: "MongoDB ObjectId của MealPlan",
          example: "664f1a2b3c4d5e6f7a8b9c0d",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: {
                  type: "string",
                  enum: [
                    "manual",
                    "suggested",
                    "selected",
                    "completed",
                    "expired",
                  ],
                  description: "Trạng thái mới muốn cập nhật",
                  example: "selected",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Cập nhật thành công",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
          },
        },
        400: {},
        401: {},
        404: {},
      },
    },
  },
  // ─── POST /mealplans/recommendations/week ────────────────────────────────────
  "/meal-plans/recommendations/week": {
    post: {
      tags: ["Meal Plans"],
      summary: "AI gợi ý thực đơn cả tuần",
      description: `Gọi engine AI (nutrition_ai_v2) để tạo thực đơn tối ưu cho N ngày liên tiếp.
 
**Thuật toán:**
- Dựa trên TDEE, mục tiêu dinh dưỡng (NutritionGoal active) và lịch sử ăn uống của user
- Tính \`adaptiveTarget\` bù trừ dư/thiếu từ các ngày trước để cân bằng dinh dưỡng cả tuần
- Tránh lặp món trong 7 ngày gần nhất, ưu tiên món user yêu thích
- Mỗi ngày gồm 3 bữa: breakfast (~25% calories), lunch (~35%), dinner (~30%)
 
**Điều kiện tiên quyết:**
- User phải có \`NutritionGoal\` với \`status: "active"\`
 
**Lưu ý:**
- API này **luôn tạo DailyMenu mới** cho mỗi ngày (upsert theo userId + date)
- Nên gọi \`GET /mealplans/status\` trước để cảnh báo user nếu đã có thực đơn
- Tạo 1 MealPlan với \`source: "ai"\`, \`status: "suggested"\`
- Sau khi xem kết quả, user gọi \`PATCH /mealplans/:planId/status\` với \`status: "selected"\` để xác nhận`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RecommendWeekRequest" },
            example: {
              startDate: "2026-04-28",
              days: 7,
              saveToDB: true,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Kết quả gợi ý thực đơn tuần",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    $ref: "#/components/schemas/WeekRecommendationResult",
                  },
                },
              },
            },
          },
        },
        400: {},
        401: {},
      },
    },
  },
};
