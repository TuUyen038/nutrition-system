const dayjs = require("dayjs");

const MealPlan = require("../models/MealPlan");
const DailyMenu = require("../models/DailyMenu");
const NutritionGoal = require("../models/NutritionGoal");

const {
  generateAdaptiveWorkoutPlan,
} = require("./workoutRecommendation.service");

const mealRecommendationService = require("./mealRecommendation.service");
const dailyMenuService = require("./dailyMenu.service");
const mealPlanService = require("./mealPlan.service");
const { toVNDateString } = require("../utils/date");
class FitnessPlanService {
  async generateWeeklyFitnessPlan(userId) {
    // ==================================================
    // STEP 1: Generate workout như cũ
    // ==================================================

    const workoutPlan = await generateAdaptiveWorkoutPlan(userId);

    // ==================================================
    // STEP 2: Lấy nutrition goal
    // ==================================================

    const goal = await NutritionGoal.findOne({
      userId,
      status: "active",
    }).lean();

    if (!goal) {
      throw new Error("Không tìm thấy Nutrition Goal");
    }

    // ==================================================
    // STEP 4: Generate menu từng ngày
    // ==================================================

    const dailyMenuIds = [];

    for (const day of workoutPlan.days) {
      const targetNutrition = this.buildNutritionTarget(
        goal.targetNutrition,
        day,
      );

      const dateStr = dayjs(day.date).format("YYYY-MM-DD");

      const { date, recipes, totalNutrition, _id } =
        await mealRecommendationService.generateDailyMenuDataV2({
          userId,
          dateStr,
          dailyTarget: targetNutrition,
        });
      dailyMenuIds.push(_id);
    }
    // ==================================================
    // STEP 5: Create meal plan
    // ==================================================
    let mealPlan = await MealPlan.findOneAndUpdate(
      {
        userId,
        startDate: toVNDateString(workoutPlan.weekStartDate),
        endDate: toVNDateString(workoutPlan.weekEndDate),
        status: { $in: ["selected"] },
      },
      {
        $set: {
          dailyMenuIds,
          generatedBy: "fitness_v1",
          status: "selected",
        },
      },
      {
        upsert: true,
        new: true,
      },
    );
    // NOTE: đối với gợi ý kết hợp thì mealplan sẽ được upsert và status ở đây là SUGGESTED always, chứ k phải selected rồi chờ gọi hàm updatePlanStatus nữa

    mealPlan = await mealPlan.populate({
      path: "dailyMenuIds",
      model: "DailyMenu" // Đảm bảo điền đúng tên Model DailyMenu của bạn
    });
    
    return {
      workoutPlan,
      mealPlan,
    };
  }

  buildNutritionTarget(baseTarget, workoutDay) {
    const target = {
      ...baseTarget,
    };

    if (workoutDay.type === "rest") {
      target.carbs = Math.round(target.carbs * 0.85);

      return target;
    }

    target.calories += Math.round(workoutDay.estimatedCalories * 0.7);

    switch (workoutDay.focus) {
      case "legs":
        target.protein = Math.round(target.protein * 1.1);

        target.carbs = Math.round(target.carbs * 1.15);

        break;

      case "push":
      case "pull":
      case "upper":
      case "lower":
        target.protein = Math.round(target.protein * 1.05);
        break;

      case "full_body":
        target.protein = Math.round(target.protein * 1.1);

        target.carbs = Math.round(target.carbs * 1.1);

        break;
    }

    return target;
  }
}

module.exports = new FitnessPlanService();
