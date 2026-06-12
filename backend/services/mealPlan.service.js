// mealPlan.service.js
const MealPlan = require("../models/MealPlan");
const DailyMenu = require("../models/DailyMenu");
const mealRecommendationService = require("./mealRecommendation.service");
const { normalizeDate, calculateEndDate, toVNDateString } = require("../utils/date");
const User = require("../models/User");
const NutritionGoal = require("../models/NutritionGoal");
const mongoose = require("mongoose");
const dayjs = require("dayjs");

// ─── Status hợp lệ theo MealPlan schema ────────────────────────────────────────
// "manual" | "suggested" | "selected" | "completed" | "deleted" | "expired"

class MealPlanService {
  // ─────────────────────────────────────────────────────────────────────────────
  // AI SUGGESTION (v2)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Gợi ý kế hoạch ăn theo tuần (hoặc N ngày) dùng thuật toán v2.
   * Mỗi ngày sẽ tạo 1 DailyMenu mới thông qua mealRecommendationService.
   *
   * @param {string}  userId
   * @param {string}  startDateStr  - "YYYY-MM-DD"
   * @param {number}  days          - mặc định 7
   * @returns {MealPlan}
   */
  // async suggestWeekPlan({ userId, startDateStr, days = 7 }) {
  //   const user = await User.findById(userId).lean();
  //   const goal = await NutritionGoal.findOne({ userId, status: "active" })
  //     .sort({ createdAt: -1 })
  //     .lean();

  //   if (!goal)
  //     throw new Error("Không tìm thấy mục tiêu dinh dưỡng đang hoạt động.");

  //   const start = dayjs(startDateStr);
  //   const dailyMenuIds = [];

  //   const dates = [];

  //   for (let i = 0; i < days; i++) {
  //     dates.push(start.add(i, "day").format("YYYY-MM-DD"));
  //   }

  //   let result;

  //   const session = await mongoose.startSession();
  //   try {
  //     await session.withTransaction(async () => {
  //       await DailyMenu.updateMany(
  //         {
  //           userId,
  //           date: { $in: dates },
  //           status: "suggested",
  //         },
  //         {
  //           $set: { status: "expired" },
  //         },
  //         { session },
  //       );

  //       // expire DailyMenu suggested and create new DailyMenu
  //       for (let i = 0; i < days; i++) {
  //         const dateStr = start.add(i, "day").format("YYYY-MM-DD");

  //         const { recipesPlanned, nutritionSum } =
  //           await mealRecommendationService.generateDailyMenuDataV2({
  //             userId,
  //             dateStr,
  //             user,
  //             dailyTarget: goal.targetNutrition,
  //           });

  //         const dailyMenu = new DailyMenu({
  //           userId,
  //           date: dateStr,
  //           recipes: recipesPlanned,
  //           totalNutrition: nutritionSum,
  //           status: "suggested",
  //         });
  //         await dailyMenu.save({ session });

  //         dailyMenuIds.push(dailyMenu._id);
  //       }
  //       // update MealPlan suggested
  //       result = await MealPlan.findOneAndUpdate(
  //         {
  //           userId,
  //           startDate: startDateStr,
  //         },
  //         {
  //           $set: {
  //             dailyMenuIds,
  //             generatedBy: "nutrition_v2",
  //             status: "suggested",
  //             endDate: start.add(days - 1, "day").format("YYYY-MM-DD"),
  //             source: "ai",
  //           },
  //           $setOnInsert: {
  //             userId,
  //             startDate: startDateStr,
  //           },
  //         },
  //         {
  //           upsert: true,
  //           new: true,
  //           session,
  //         },
  //       );
  //     });

  //     return result;
  //   } finally {
  //     await session.endSession();
  //   }
  // }

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL PLAN
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Tạo MealPlan thủ công.
   * Với mỗi ngày trong khoảng: nếu đã có DailyMenu thì reuse, chưa có thì tạo rỗng.
   *
   * @param {string} userId
   * @param {{ startDate: string, period?: string }} planData
   * @returns {MealPlan}
   */
  async createPlan(userId, planData) {
    const { startDate, period = "week" } = planData;
    const startDateNorm = normalizeDate(startDate);
    const endDate = calculateEndDate(startDateNorm, period);
    const dates = this._generateDateList(startDateNorm, period);

    const existingMenus = await DailyMenu.find({
      userId,
      date: { $in: dates },
      status: { $in: ["manual", "selected"] },
    }).lean();
    const existingMap = {};
    existingMenus.forEach((dm) => {
      existingMap[normalizeDate(dm.date)] = dm;
    });

    const dailyMenuIds = [];

    for (const date of dates) {
      let dailyMenu = existingMap[date];

      if (!dailyMenu) {
        dailyMenu = await DailyMenu.create({
          userId,
          date,
          recipes: [],
          totalNutrition: {
            calories: 0,
            protein: 0,
            fat: 0,
            carbs: 0,
            fiber: 0,
            sugar: 0,
            sodium: 0,
          },
          status: "manual",
        });
      }

      dailyMenuIds.push(dailyMenu._id);
    }

    const newPlan = new MealPlan({
      userId,
      startDate: startDateNorm,
      endDate,
      dailyMenuIds,
      source: "user",
      status: "manual",
    });

    await newPlan.save();
    return newPlan;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Lấy MealPlan theo startDate của user.
   */
  async getPlanByStartDate(userId, startDateStr) {
    const startDate = normalizeDate(startDateStr);
    return MealPlan.findOne({ userId, startDate }).populate({
      path: "dailyMenuIds",
      populate: { path: "recipes.recipeId", model: "Recipe" },
    });
  }

  /**
   * Lấy tất cả MealPlan của user, hỗ trợ filter thêm (vd: status).
   */
  async getPlansByUserId(userId, filter = {}) {
    return MealPlan.find({ userId, ...filter })
      .sort({ startDate: -1 })
      .populate({
        path: "dailyMenuIds",
        select: "date totalNutrition status",
      })
      .lean();
  }

  /**
   * Lấy chi tiết 1 MealPlan theo ID (có populate DailyMenu + Recipe).
   */
  async getPlanById(planId) {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new Error("ID MealPlan không hợp lệ.");
    }
    return MealPlan.findById(planId)
      .populate({
        path: "dailyMenuIds",
        populate: { path: "recipes.recipeId", model: "Recipe" },
      })
      .lean();
  }

  /**
   * Kiểm tra các ngày trong khoảng đã có DailyMenu chưa.
   * Dùng để hỏi user trước khi gợi ý lại (tránh ghi đè).
   *
   * @returns {{ hasExisting: boolean, existingDates: string[] }}
   */
  async checkWeekDailyMenus({ userId, startDateStr, days = 7 }) {
    const dates = this._generateDateList(startDateStr, days);
    const menus = await DailyMenu.find({
      userId,
      date: { $in: dates },
      status: { $in: ["manual", "selected"] },
    })
      .select("date _id")
      .lean();

    const existingDates = menus.map((m) => m.date);
    return { hasExisting: existingDates.length > 0, existingDates };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Cập nhật trạng thái MealPlan.
   *
   * Ràng buộc:
   *  - Không thể cập nhật plan đã "completed" hoặc "deleted".
   *  - Khi chuyển sang "selected": tự động "expired" các plan "suggested" khác
   *    của cùng user để tránh xung đột.
   *
   * Status hợp lệ: "manual" | "suggested" | "selected" | "completed" | "deleted" | "expired"
   */
  async updatePlanStatus(userId, planId, newStatus) {
    const VALID_STATUSES = [
      "manual",
      "suggested",
      "selected",
      "completed",
      "deleted",
      "expired",
    ];
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new Error(
        `Trạng thái không hợp lệ. Các giá trị cho phép: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const plan = await MealPlan.findOne({ _id: planId, userId });
    if (!plan)
      throw new Error("Không tìm thấy MealPlan hoặc bạn không có quyền.");

    // Không cho cập nhật plan đã kết thúc
    if (plan.status === "completed" || plan.status === "deleted") {
      throw new Error(
        `Không thể cập nhật Plan đang ở trạng thái "${plan.status}".`,
      );
    }

    // Khi user chọn 1 plan -> expire các plan suggested khác bị trùng thời gian
    if (newStatus === "selected") {
      await MealPlan.updateMany(
        {
          userId,
          _id: { $ne: planId },
          status: "suggested",
          // Kiểm tra overlap: plan khác có startDate nằm trong khoảng plan hiện tại
          startDate: { $lte: plan.endDate || plan.startDate },
          $or: [
            { endDate: { $gte: plan.startDate } },
            { endDate: { $exists: false } },
          ],
        },
        { $set: { status: "expired" } },
      );
    }

    plan.status = newStatus;
    await plan.save();
    return plan;
  }

  /**
   * Xóa mềm MealPlan (chuyển status -> "deleted").
   * Chỉ cho phép xóa plan thuộc user đó và chưa "completed".
   */
  async deletePlan(userId, planId) {
    const plan = await MealPlan.findOne({ _id: planId, userId });
    if (!plan)
      throw new Error("Không tìm thấy MealPlan hoặc bạn không có quyền.");

    if (plan.status === "completed") {
      throw new Error("Không thể xóa Plan đã hoàn thành.");
    }

    plan.status = "deleted";
    await plan.save();
    return plan;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Sinh danh sách ngày từ startDate theo period ("week") hoặc số ngày.
   *
   * @param {string}        startDate - "YYYY-MM-DD"
   * @param {string|number} period    - "week" hoặc số ngày (number)
   * @returns {string[]}
   */
  _generateDateList(startDate, period) {
  const total = period === "week" ? 7 : Number(period) || 1;

  return Array.from({ length: total }, (_, i) =>
    toVNDateString(
      dayjs(startDate)
        .tz("Asia/Ho_Chi_Minh")
        .startOf("day")
        .add(i, "day")
    )
  );
}

  async refreshMealPlanNutritionByDailyMenu(dailyMenuId) {
    const plan = await MealPlan.findOne({
      dailyMenuIds: dailyMenuId,
      status: {
        $nin: ["deleted", "expired"],
      },
    });

    if (!plan) return null;

    const dailyMenus = await DailyMenu.find({
      _id: { $in: plan.dailyMenuIds },
      status: {
        $nin: ["deleted", "expired"],
      },
    }).lean();

    const total = {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    };

    for (const menu of dailyMenus) {
      total.calories += menu.totalNutrition?.calories || 0;
      total.protein += menu.totalNutrition?.protein || 0;
      total.fat += menu.totalNutrition?.fat || 0;
      total.carbs += menu.totalNutrition?.carbs || 0;
      total.fiber += menu.totalNutrition?.fiber || 0;
      total.sugar += menu.totalNutrition?.sugar || 0;
      total.sodium += menu.totalNutrition?.sodium || 0;
    }

    const count = dailyMenus.length || 1;

    const average = {
      calories: Number((total.calories / count).toFixed(2)),
      protein: Number((total.protein / count).toFixed(2)),
      fat: Number((total.fat / count).toFixed(2)),
      carbs: Number((total.carbs / count).toFixed(2)),
      fiber: Number((total.fiber / count).toFixed(2)),
      sugar: Number((total.sugar / count).toFixed(2)),
      sodium: Number((total.sodium / count).toFixed(2)),
    };

    plan.weeklyTotalNutrition = total;
    plan.weeklyAverageNutrition = average;

    await plan.save();

    return plan;
  }
}

module.exports = new MealPlanService();
