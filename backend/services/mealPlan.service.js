const Meal = require("../models/DailyMenu"); // Cần để tham chiếu (dù chưa dùng trong các hàm này)
const MealPlan = require("../models/MealPlan");
const { calculateEndDate } = require("../utils/date");
const mongoose = require("mongoose");
const DailyMenuService = require("../services/dailyMenu.service");
const DailyMenu = require("../models/DailyMenu");
const { normalizeDate } = require("../utils/date");
const Recipe = require("../models/Recipe");
const dayjs = require("dayjs");
const User = require("../models/User");
const NutritionGoal = require("../models/NutritionGoal");

// mealPlan.service.js
const mealRecommendationService = require("./mealRecommendation.service");


class MealPlanService {

  async suggestWeekPlanV2({ userId, startDateStr, days = 7 }) {
  const user = await User.findById(userId).lean();
  const goal = await NutritionGoal.findOne({ userId, status: "active" })
    .sort({ createdAt: -1 })
    .lean();

  if (!goal) throw new Error("No active nutrition goal");

  const dailyMenuIds = [];
  const start = dayjs(startDateStr);

  for (let i = 0; i < days; i++) {
    const d = start.add(i, "day").format("YYYY-MM-DD");
    
    const { recipesPlanned, nutritionSum } =
      await mealRecommendationService.generateDailyMenuDataV2({
        userId,
        dateStr: d,
        user,
        dailyTarget: goal.targetNutrition,
      });

    const dailyMenu = await DailyMenu.create({
      userId,
      date: d,
      recipes: recipesPlanned,
      totalNutrition: nutritionSum,
      status: "suggested",
    });

    dailyMenuIds.push(dailyMenu._id);
  }

  return await MealPlan.create({
    userId,
    startDate: startDateStr,
    endDate: start.add(days - 1, "day").format("YYYY-MM-DD"),
    dailyMenuIds,
    source: "ai",
    generatedBy: "nutrition_ai_v2",
    status: "suggested",
  });
}

  async getRecipeUsageStats(userId, dateStr, windowDays = 7) {
    const base = dayjs(dateStr);

    const dates = [];
    for (let i = 1; i <= windowDays; i++) {
      dates.push(base.subtract(i, "day").format("YYYY-MM-DD"));
    }

    const menus = await DailyMenu.find({
      userId,
      date: { $in: dates },
    }).lean();

    const countMap = new Map(); // recipeId -> số lần xuất hiện trong windowDays
    const last3DaysSet = new Set(); // recipeId xuất hiện trong 3 ngày gần nhất
    const last3Dates = dates.slice(0, 3); // 3 ngày ngay trước dateStr

    for (const menu of menus) {
      const isLast3 = last3Dates.includes(menu.date);
      for (const item of menu.recipes || []) {
        if (!item.recipeId) continue;
        const idStr = String(item.recipeId);
        countMap.set(idStr, (countMap.get(idStr) || 0) + 1);
        if (isLast3) {
          last3DaysSet.add(idStr);
        }
      }
    }

    return { countMap, last3DaysSet };
  }
  async getRecentRecipeIds(userId, dateStr, daysBack = 3) {
    const base = dayjs(dateStr); // dateStr dạng "YYYY-MM-DD"

    const dates = [];
    for (let i = 1; i <= daysBack; i++) {
      dates.push(base.subtract(i, "day").format("YYYY-MM-DD"));
    }
    const recentMenus = await DailyMenu.find({
      userId,
      date: { $in: dates },
    }).lean();
    const idsSet = new Set();
    for (const menu of recentMenus) {
      for (const item of menu.recipes || []) {
        if (item.recipeId) {
          idsSet.add(String(item.recipeId));
        }
      }
    }
    return Array.from(idsSet); // array string id
  }
  async getUserDailyTarget(userId) {
    const [user, goal] = await Promise.all([
      User.findById(userId).lean(),
      NutritionGoal.findOne({ userId, status: "active" })
        .sort({ createdAt: -1 }) // lấy goal mới nhất
        .lean(),
    ]);

    let dailyTarget;

    if (goal && goal.targetNutrition) {
      const base = goal.targetNutrition;
      let factor = 1;

      switch (goal.period) {
        case "week":
          factor = 1 / 7;
          break;
        case "month":
          factor = 1 / 30;
          break;
        case "custom":
          factor = 1 / (goal.periodValue || 1);
          break;
        case "day":
        default:
          factor = 1;
          break;
      }

      dailyTarget = {
        calories: (base.calories || 0) * factor,
        protein: (base.protein || 0) * factor,
        fat: (base.fat || 0) * factor,
        carbs: (base.carbs || 0) * factor,
        fiber: (base.fiber || 0) * factor,
        sugar: (base.sugar || 0) * factor,
        sodium: (base.sodium || 0) * factor,
      };
    } else {
      // fallback nếu chưa set NutritionGoal
      const baseCalories = 2000;
      dailyTarget = {
        calories: baseCalories,
        protein: (baseCalories * 0.2) / 4,
        fat: (baseCalories * 0.3) / 9,
        carbs: (baseCalories * 0.5) / 4,
        fiber: 25,
        sugar: 40,
        sodium: 2000,
      };
    }
    return { user, target: dailyTarget };
  }
  /**
   * Chọn 1 recipe cho 1 bữa ăn.
   * Ở đây không còn field mealType trong Recipe, nên:
   *  - Mặc định chọn bất kỳ món nào,
   *  - Nếu muốn lọc theo category (main/side/dessert/drink), truyền vào preferredCategories.
   *  - Dùng totalNutrition để tính lệch calories.
   */
  async pickRecipeForMeal({
    user,
    targetCalories,
    preferredCategories = [],
    usageStats, // { countMap, last3DaysSet }
  }) {
    const { countMap, last3DaysSet } = usageStats || {
      countMap: new Map(),
      last3DaysSet: new Set(),
    };

    const query = {};

    if (preferredCategories.length) {
      query.category = { $in: preferredCategories };
    }

    if (user?.bannedIngredients?.length) {
      query["ingredients.name"] = { $nin: user.bannedIngredients };
    }

    query.deleted = { $ne: true }; // ✅ Filter deleted
    let candidates = await Recipe.find(query).lean();
    if (!candidates.length) return null;

    let best = null;
    let bestScore = Infinity;

    for (const r of candidates) {
      const nut = r.totalNutrition || {};
      const cal = nut.calories || 0;
      const diffCal = Math.abs(cal - targetCalories);

      const idStr = String(r._id);
      const freq = countMap.get(idStr) || 0;
      const usedInLast3 = last3DaysSet.has(idStr) ? 1 : 0;

      // penalty tần suất + penalty gần đây
      const penaltyRecent = usedInLast3 * 70; // rất ghét món mới ăn gần đây
      const penaltyFreq = freq * 30; // càng ăn nhiều trong 7 ngày thì càng bị phạt

      const randomNoise = Math.random() * 40; // tạo chút ngẫu nhiên

      const score = diffCal + penaltyRecent + penaltyFreq + randomNoise;

      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  }

  async generateDailyMenuData({ userId, dateStr }) {
    const { user, target } = await this.getUserDailyTarget(userId);

    const MEAL_TYPES = ["breakfast", "lunch", "dinner"];
    const MEAL_DISTRIBUTION = {
      breakfast: 0.25,
      lunch: 0.35,
      dinner: 0.3,
    };

    const targetCaloriesPerMeal = {};
    for (const m of MEAL_TYPES) {
      targetCaloriesPerMeal[m] = (target.calories || 0) * MEAL_DISTRIBUTION[m];
    }

    const usageStats = await this.getRecipeUsageStats(userId, dateStr, 7);

    const recipesPlanned = [];
    const usedInDay = new Set();
    const nutritionSum = {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    };

    for (const mealType of MEAL_TYPES) {
      let preferredCategories = [];
      if (mealType === "breakfast") {
        preferredCategories = ["main", "drink"];
      } else if (mealType === "lunch" || mealType === "dinner") {
        preferredCategories = ["main", "side"];
      }

      const recipe = await this.pickRecipeForMeal({
        user,
        targetCalories: targetCaloriesPerMeal[mealType],
        preferredCategories,
        usageStats,
      });

      if (!recipe) continue;
      const idStr = String(recipe._id);
      if (usedInDay.has(idStr)) continue;

      usedInDay.add(idStr);

      const portion = 1;

      recipesPlanned.push({
        recipeId: recipe._id,
        portion,
        name: recipe.name,
        totalNutrition: recipe.  totalNutrition,
        servingTime: mealType,
        imageUrl: recipe.imageUrl,
        status: "planned",
      });

      const nut = recipe.totalNutrition || {};
      nutritionSum.calories += (nut.calories || 0) * portion;
      nutritionSum.protein += (nut.protein || 0) * portion;
      nutritionSum.fat += (nut.fat || 0) * portion;
      nutritionSum.carbs += (nut.carbs || 0) * portion;
      nutritionSum.fiber += (nut.fiber || 0) * portion;
      nutritionSum.sugar += (nut.sugar || 0) * portion;
      nutritionSum.sodium += (nut.sodium || 0) * portion;
    }

    return { recipesPlanned, nutritionSum };
  }
  /**
   * Upsert DailyMenu cho 1 ngày theo mode:
   *  - "reuse": nếu đã có -> giữ nguyên, KHÔNG thay đổi gì
   *  - "overwrite": nếu đã có -> dùng doc cũ, CHỈ SỬA recipes + totalNutrition
   *  - nếu chưa có -> luôn tạo mới
   */
  async upsertDailyMenuForDate({ userId, dateStr, mode = "reuse" }) {
    const normalizedDate = dayjs(dateStr).format("YYYY-MM-DD");

    // nếu có nhiều doc trùng ngày, lấy doc mới nhất (tránh trùng rác cũ)
    let existing = await DailyMenu.findOne({
      userId,
      date: normalizedDate,
    }).sort({ createdAt: -1 });

    // 1) chưa có DailyMenu cho ngày này -> generate + create mới
    if (!existing) {
      const { recipesPlanned, nutritionSum } = await this.generateDailyMenuData(
        {
          userId,
          dateStr: normalizedDate,
        }
      );
      existing = await DailyMenu.create({
        userId,
        date: normalizedDate,
        recipes: recipesPlanned,
        totalNutrition: nutritionSum,
      });

      return existing;
    }

    // 2) đã có DailyMenu
    if (mode === "reuse") {
      // => giữ nguyên, không đụng gì
      return existing;
    }

    if (mode === "overwrite") {
      // => chỉ cập nhật nội dung, TÁI SỬ DỤNG doc cũ (giữ nguyên _id)
      const { recipesPlanned, nutritionSum } = await this.generateDailyMenuData(
        {
          userId,
          dateStr: normalizedDate,
        }
      );

      existing.recipes = recipesPlanned;
      existing.totalNutrition = nutritionSum;
      // nếu muốn giữ feedback cũ thì đừng đụng feedback
      // existing.feedback = undefined; // tuỳ bạn

      await existing.save();
      return existing;
    }

    // mode lạ -> cứ reuse
    return existing;
  }
  /**
   * Tạo MealPlan theo tuần với 2 kiểu:
   *  - mode = "reuse"    -> giữ DailyMenu cũ nếu có
   *  - mode = "overwrite"-> ghi đè DailyMenu của các ngày đã có menu
   */
  async suggestWeekPlan({ userId, startDateStr, days = 7, mode = "reuse" }) {
    const start = dayjs(startDateStr);
    const dailyMenuIds = [];

    for (let i = 0; i < days; i++) {
      const d = start.add(i, "day").format("YYYY-MM-DD");

      const dailyMenu = await this.upsertDailyMenuForDate({
        userId,
        dateStr: d,
        mode, // "reuse" hoặc "overwrite"
      });
      dailyMenuIds.push(dailyMenu._id);
    }

    const mealPlan = await MealPlan.create({
      userId,
      startDate: startDateStr,
      endDate: start.add(days - 1, "day").format("YYYY-MM-DD"),
      dailyMenuIds,
      source: "ai",
      generatedBy: "nutrition_ai_v1",
      status: "suggested",
    });

    return mealPlan;
  }

  async updateMealPlanOnMealClone(mealPlanId, oldMealId, newMealId) {
    if (!mealPlanId) return null;

    try {
      const updatedPlan = await MealPlan.findByIdAndUpdate(
        mealPlanId,
        {
          // 1. Loại bỏ ID cũ (A)
          $pull: { meals: oldMealId },
          // 2. Thêm ID mới (B) vào mảng meals
          $push: { meals: newMealId },
          // 3. Đánh dấu Plan đã bị chỉnh sửa (YÊU CẦU: trường isModified: Boolean trong schema)
          $set: { isModified: true },
        },
        // new: true trả về bản ghi đã cập nhật, runValidators: đảm bảo dữ liệu mới hợp lệ
        { new: true, runValidators: true }
      );

      if (!updatedPlan) {
        console.warn(
          `MealPlan ID ${mealPlanId} not found during meal clone update.`
        );
      }

      return updatedPlan;
    } catch (error) {
      console.error("Lỗi khi cập nhật MealPlan on meal clone:", error);
      throw new Error("Lỗi khi cập nhật MealPlan sau khi chỉnh sửa Meal.");
    }
  }

  generateDateList(startDate, period) {
    startDate = normalizeDate(startDate);

    let total = period === "week" ? 7 : 1; // ví dụ custom thì bạn mở rộng

    const list = [];
    let d = new Date(startDate + "T00:00:00+07:00");

    for (let i = 0; i < total; i++) {
      const current = new Date(d);
      current.setDate(d.getDate() + i);
      list.push(normalizeDate(current));
    }

    return list;
  }

  async checkWeekDailyMenus({ userId, startDateStr, days = 7 }) {
  const dates = this.generateDateList(startDateStr, days);

  const menus = await DailyMenu.find({
    userId,
    date: { $in: dates },
  })
    .select("date _id")
    .lean();

  const existingDates = menus.map((m) => m.date);

  return {
    hasExisting: existingDates.length > 0,
    existingDates,
  };
}

  /** Tạo Plan + DailyMenus */
  async createPlan(userId, planData) {
    const { startDate, period = "week", aiMeals } = planData;
    const startDateNorm = normalizeDate(startDate);
    const endDate = calculateEndDate(startDateNorm, period);
    const dates = this.generateDateList(startDateNorm, period);

    //existingMenus, dailyMenuIds,
    const existingMenus = await DailyMenu.find({
      userId,
      date: { $in: dates },
    });

    const existingMap = {};
    existingMenus.forEach((dm) => {
      existingMap[normalizeDate(dm.date)] = dm;
    });

    const dailyMenuIds = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]; // string chuẩn

      let dailyMenu = existingMap[date];

      // Nếu ngày không có menu, tạo menu rỗng (không gợi ý AI)
      if (!dailyMenu) {
        const result = await DailyMenuService.createDailyMenu({
          userId,
          date,
          recipes: [], // DailyMenu rỗng
          status: "planned",
        });

        if (!result?.data) {
          throw new Error(`Cannot create DailyMenu for ${date}`);
        }
        dailyMenu = result.data;
      }
      dailyMenuIds.push(dailyMenu);
    }

    // Tạo MealPlan tuần với tất cả DailyMenu (cũ + mới)
    const newPlan = new MealPlan({
      ...planData,
      userId,
      startDate: startDateNorm,
      endDate,
      dailyMenuIds,
      status: aiMeals ? "suggested" : "planned",
      source: aiMeals ? "ai" : "user",
    });

    await newPlan.save();
    return newPlan;
  }

  async getPlanByStartDate(userId, startDateStr) {
    const startDate = normalizeDate(startDateStr);

    return MealPlan.findOne({
      userId,
      startDate,
    }).populate({
      path: "dailyMenuIds",
      populate: {
        path: "recipes.recipeId",
        model: "Recipe",
      },
    });
  }

  async getPlansByUserId(userId, filter = {}) {
    // Lấy tất cả Plan của người dùng, sắp xếp theo startDate mới nhất
    return MealPlan.find({ userId, ...filter })
      .sort({ startDate: -1 })
      .populate("meals") // Populate các Meal liên quan nếu cần hiển thị chi tiết
      .lean();
  }

  async getPlanById(planId) {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new Error("ID Plan không hợp lệ.");
    }
    return MealPlan.findById(planId).populate("meals").lean();
  }

  async updatePlanStatus(userId, planId, newStatus) {
    const validStatuses = ["suggested", "selected", "completed", "cancelled"];
    if (!validStatuses.includes(newStatus)) {
      throw new Error("Trạng thái không hợp lệ.");
    }

    const plan = await MealPlan.findOne({ _id: planId, userId });
    if (!plan) {
      throw new Error("Không tìm thấy MealPlan hoặc bạn không có quyền.");
    }

    // Ràng buộc 1: Chỉ có thể cập nhật trạng thái nếu nó không phải là "completed" hoặc "cancelled"
    if (plan.status === "completed" || plan.status === "cancelled") {
      throw new Error(
        `Không thể cập nhật Plan đã ở trạng thái ${plan.status}.`
      );
    }

    // Ràng buộc 2: Xử lý logic khi chuyển trạng thái sang "selected"
    if (newStatus === "planned") {
      // Hủy (cancelled) tất cả các MealPlan "suggested" khác đang bị chồng lấn thời gian
      await MealPlan.updateMany(
        {
          userId,
          _id: { $ne: planId }, // Loại trừ plan hiện tại
          status: "suggested",
        },
        { $set: { status: "cancelled" } }
      );
    }

    plan.status = newStatus;
    await plan.save();
    return plan;
  }

  async deletePlan(userId, planId) {
    const result = await MealPlan.deleteOne({
      _id: planId,
      userId,
      status: "suggested",
    });
    if (result.deletedCount === 0) {
      throw new Error(
        "Không thể xóa Plan đã được chọn (selected) hoặc không tìm thấy."
      );
    }
  }
}

module.exports = new MealPlanService();
