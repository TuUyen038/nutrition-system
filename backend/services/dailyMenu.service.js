const DailyMenu = require("../models/DailyMenu");
const MealPlan = require("../models/MealPlan");
const { calculateTotalNutrition } = require("../utils/calTotalNutri");
const mongoose = require("mongoose");
const { normalizeDate } = require("../utils/date");
const User = require("../models/User");
const NutritionGoal = require("../models/NutritionGoal");
const Recipe = require("../models/Recipe");
const { createMealLog, deleteMealLog } = require("./mealLog.service");

// async function getUserDailyTarget(userId) {
//   const [user, goal] = await Promise.all([
//     User.findById(userId).lean(),
//     NutritionGoal.findOne({ userId, status: "active" })
//       .sort({ createdAt: -1 }) // lấy goal mới nhất
//       .lean(),
//   ]);

//   let dailyTarget;

//   if (goal && goal.targetNutrition) {
//     const base = goal.targetNutrition;
//     let factor = 1;

//     switch (goal.period) {
//       case "week":
//         factor = 1 / 7;
//         break;
//       case "month":
//         factor = 1 / 30;
//         break;
//       case "custom":
//         factor = 1 / (goal.periodValue || 1);
//         break;
//       default:
//         factor = 1;
//         break;
//     }

//     dailyTarget = {
//       calories: (base.calories || 0) * factor,
//       protein: (base.protein || 0) * factor,
//       fat: (base.fat || 0) * factor,
//       carbs: (base.carbs || 0) * factor,
//       fiber: (base.fiber || 0) * factor,
//       sugar: (base.sugar || 0) * factor,
//       sodium: (base.sodium || 0) * factor,
//     };
//   } else {
//     const baseCalories = 2000;
//     dailyTarget = {
//       calories: baseCalories,
//       protein: (baseCalories * 0.2) / 4,
//       fat: (baseCalories * 0.3) / 9,
//       carbs: (baseCalories * 0.5) / 4,
//       fiber: 25,
//       sugar: 40,
//       sodium: 2000,
//     };
//   }

//   return { user, target: dailyTarget };
// }
// async function pickRecipeForMeal({
//   user,
//   targetCalories,
//   preferredCategories = [],
//   usageStats,
// }) {
//   const { countMap, last3DaysSet } = usageStats || {
//     countMap: new Map(),
//     last3DaysSet: new Set(),
//   };

//   const query = {
//     deleted: { $ne: true }, //  Filter deleted
//   };

//   if (preferredCategories.length) {
//     query.category = { $in: preferredCategories };
//   }

//   if (user?.bannedIngredients?.length) {
//     query["ingredients.name"] = { $nin: user.bannedIngredients };
//   }

//   let candidates = await Recipe.find(query).lean();
//   if (!candidates.length) return null;

//   let best = null;
//   let bestScore = Infinity;

//   for (const r of candidates) {
//     const nut = r.totalNutrition || {};
//     const cal = nut.calories || 0;
//     const diffCal = Math.abs(cal - targetCalories);

//     const idStr = String(r._id);
//     const freq = countMap.get(idStr) || 0;
//     const usedInLast3 = last3DaysSet.has(idStr) ? 1 : 0;

//     // penalty tần suất + penalty gần đây
//     const penaltyRecent = usedInLast3 * 70; // rất ghét món mới ăn gần đây
//     const penaltyFreq = freq * 30; // càng ăn nhiều trong 7 ngày thì càng bị phạt

//     const randomNoise = Math.random() * 30; // tạo chút ngẫu nhiên

//     const score = diffCal + penaltyRecent + penaltyFreq + randomNoise;

//     if (score < bestScore) {
//       bestScore = score;
//       best = r;
//     }
//   }

//   return best;
// }
// exports.suggestDailyMenu = async ({ userId, dateStr }) => {
//   const { user, target } = await getUserDailyTarget(userId);

//   const MEAL_TYPES = ["breakfast", "lunch", "dinner"];
//   const MEAL_DISTRIBUTION = {
//     breakfast: 0.25,
//     lunch: 0.35,
//     dinner: 0.3,
//     // 10% còn lại dành cho snack (chưa xử lý)
//   };

//   const targetCaloriesPerMeal = {};
//   for (const m of MEAL_TYPES) {
//     targetCaloriesPerMeal[m] = (target.calories || 0) * MEAL_DISTRIBUTION[m];
//   }

//   const recipesPlanned = [];
//   const usedRecipeIds = [];
//   const nutritionSum = {
//     calories: 0,
//     protein: 0,
//     fat: 0,
//     carbs: 0,
//     fiber: 0,
//     sugar: 0,
//     sodium: 0,
//   };

//   for (const mealType of MEAL_TYPES) {
//     // bạn có thể tùy biến mapping mealType -> category
//     // ví dụ:
//     let preferredCategories = [];
//     if (mealType === "breakfast") {
//       preferredCategories = ["main", "drink"];
//     } else if (mealType === "lunch" || mealType === "dinner") {
//       preferredCategories = ["main", "side"];
//     }

//     const recipe = await pickRecipeForMeal({
//       user,
//       targetCalories: targetCaloriesPerMeal[mealType],
//       excludedRecipeIds: usedRecipeIds,
//       preferredCategories,
//     });

//     if (!recipe) continue;

//     usedRecipeIds.push(recipe._id);

//     const portion = 1; //mặc định là 1. Sau này mở rộng có thể chọn trùng món trong 1 ngày thì biến này sẽ được set lại

//     recipesPlanned.push({
//       recipeId: recipe._id,
//       portion: portion,
//       servingTime: mealType,
//       status: "planned",
//     });

//     const nut = recipe.totalNutrition || {};
//     nutritionSum.calories += (nut.calories || 0) * portion;
//     nutritionSum.protein += (nut.protein || 0) * portion;
//     nutritionSum.fat += (nut.fat || 0) * portion;
//     nutritionSum.carbs += (nut.carbs || 0) * portion;
//     nutritionSum.fiber += (nut.fiber || 0) * portion;
//     nutritionSum.sugar += (nut.sugar || 0) * portion;
//     nutritionSum.sodium += (nut.sodium || 0) * portion;
//   }
//   const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

//   nutritionSum.calories = round2(nutritionSum.calories);
//   nutritionSum.protein = round2(nutritionSum.protein);
//   nutritionSum.fat = round2(nutritionSum.fat);
//   nutritionSum.carbs = round2(nutritionSum.carbs);
//   nutritionSum.fiber = round2(nutritionSum.fiber);
//   nutritionSum.sugar = round2(nutritionSum.sugar);
//   nutritionSum.sodium = round2(nutritionSum.sodium);

//   const dailyMenu = await DailyMenu.create({
//     userId,
//     date: dateStr, // "YYYY-MM-DD"
//     recipes: recipesPlanned,
//     totalNutrition: nutritionSum,
//   });

//   return dailyMenu;
// };
function toDateOnly(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}
exports.getRecipesByDateAndStatus = async (data) => {
  try {
    let { userId, startDate, endDate, status } = data;
    if (!endDate) endDate = startDate;
    if (!userId || !startDate) {
      throw new Error("Thiếu thời gian hoặc userId.");
    }

    startDate = normalizeDate(startDate);
    endDate = normalizeDate(endDate);

    const dailyMenus = await DailyMenu.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate({
        path: "recipes.recipeId",
        model: "Recipe",
        match: { deleted: { $ne: true } },
      })
      .lean();
    if (!dailyMenus?.length) return [];

    const isFilteringByStatus = status && status.trim() !== "";

    const history = dailyMenus.map((menu) => {
      const recipes = menu.recipes
        .filter((r) => {
          // Filter theo status
          if (isFilteringByStatus && r.status !== status) return false;
          // Filter deleted recipes - chỉ lấy live data từ Recipe collection
          if (r.recipeId && r.recipeId.deleted === true) return false;
          // Không có recipeId (populate không match) → filter ra
          if (!r.recipeId) return false;
          return true;
        })
        .map((r) => {
          if (r.recipeId) {
            return {
              _id: r._id,
              recipeId: r.recipeId,
              name: r.recipeId?.name,
              imageUrl: r.recipeId?.imageUrl,
              totalNutrition: r.recipeId?.totalNutrition,
              description: r.recipeId?.description,
              portion: r.portion,
              note: r.note,
              status: r.status,
            };
          }
          return null;
        })
        .filter(Boolean); // Filter ra các recipe bị xóa hoặc không có recipeId

      return {
        ...menu,
        recipes,
      };
    });

    return history;
  } catch (err) {
    console.error(err);
    throw new Error("Lỗi khi lấy dữ liệu recipes trong daily menu");
  }
};
exports.updateDailyMenuStatus = async ({ userId, dailyMenuId, newStatus }) => {
  const dailyMenu = await DailyMenu.findOne({ _id: dailyMenuId, userId });
  if (!dailyMenu) throw new Error("Không tìm thấy thực đơn ngày này!");

  dailyMenu.status = newStatus;
  return await dailyMenu.save();
};
exports.addRecipeToMenu = async ({
  userId,
  date,
  dailyMenuId,
  recipeId,
  scale,
  servingTime,
}) => {
  const amountToAdd = scale || 1; // Lượng scale người dùng vừa nhập thêm
  const targetTime = servingTime || "other";

  const filter = dailyMenuId ? { _id: dailyMenuId, userId } : { userId, date };
  // 1. Tìm hoặc tạo mới DailyMenu (Khởi tạo totalNutrition = 0 nếu tạo mới)
  let dailyMenu = await DailyMenu.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        recipes: [],
        totalNutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        targetNutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        status: "manual",
      },
    },
    { new: true, upsert: true },
  );

  // 2. Lấy thông tin dinh dưỡng gốc của Recipe
  const recipeData = await Recipe.findById(recipeId)
    .select("name imageUrl description totalNutritionPerServing mealSources")
    .lean();
  console.log("Recipe data:", recipeData);
  if (!recipeData) throw new Error("Món ăn không tồn tại!");

  // 3. CẬP NHẬT TOTAL NUTRITION CỦA DAILY MENU (Cộng dồn vào tổng hiện tại)
  // Logic: Tổng_Ngày_Mới = Tổng_Ngày_Cũ + (Dinh_Dưỡng_Món * Lượng_Thêm)
  const nutrients = ["calories", "protein", "fat", "carbs"];
  nutrients.forEach((field) => {
    const addedValue =
      (recipeData.totalNutritionPerServing?.[field] || 0) * amountToAdd;

    // Cộng trực tiếp vào object totalNutrition của dailyMenu vừa lấy được
    dailyMenu.totalNutrition[field] =
      (dailyMenu.totalNutrition[field] || 0) + addedValue;
  });

  // push món mới vào mảng
  dailyMenu.recipes.push({
    recipeId,
    name: recipeData.name,
    imageUrl: recipeData.imageUrl,
    description: recipeData.description,
    nutrition: recipeData.totalNutritionPerServing,
    mealSources: recipeData.mealSources,
    scale: amountToAdd,
    servingTime: targetTime,
    isChecked: false,
  });

  // 5. Lưu lại toàn bộ thay đổi (Cả mảng recipes và totalNutrition tổng)
  return await dailyMenu.save();
};
exports.updateRecipeInMenu = async ({
  userId,
  dailyMenuId,
  recipeItemId,
  newScale,
  checked,
}) => {
  // 1. Tìm menu
  const dailyMenu = await DailyMenu.findOne({ _id: dailyMenuId, userId });
  if (!dailyMenu) throw new Error("Không tìm thấy thực đơn ngày này!");

  // 2. Tìm món ăn trong mảng bằng recipeItemId
  const recipeIndex = dailyMenu.recipes.findIndex(
    (item) => item._id.toString() === recipeItemId.toString(),
  );

  if (recipeIndex === -1)
    throw new Error("Món ăn không tồn tại trong thực đơn!");

  const targetRecipe = dailyMenu.recipes[recipeIndex];

  // 3. Cập nhật Scale
  if (typeof newScale === "number") {
    const oldScale = targetRecipe.scale;
    const scaleDiff = newScale - oldScale;

    // Cập nhật tổng dinh dưỡng
    const nutrients = ["calories", "protein", "fat", "carbs"];
    nutrients.forEach((field) => {
      const unitValue = targetRecipe.nutrition[field] || 0;
      dailyMenu.totalNutrition[field] += unitValue * scaleDiff;
    });

    if (newScale <= 0) {
      // Nếu scale <= 0, xóa món khỏi thực đơn
      dailyMenu.recipes.splice(recipeIndex, 1);
    } else {
      targetRecipe.scale = newScale;
    }
  }

  // 4. Cập nhật Trạng thái Checked
  if (checked !== undefined && checked !== null) {
    targetRecipe.isChecked = checked;

    // Xử lý MealLog
    if (checked === true) {
      await createMealLog(userId, targetRecipe, dailyMenu.date, dailyMenu._id);
    } else {
      await deleteMealLog(userId, targetRecipe, dailyMenu.date, dailyMenu._id);
    }
  }

  // 5. Lưu lại
  return await dailyMenu.save();
};
exports.deleteRecipeInMenu = async ({ userId, dailyMenuId, recipeItemId }) => {
  // 1. Tìm menu
  const dailyMenu = await DailyMenu.findOne({ _id: dailyMenuId, userId });
  if (!dailyMenu) throw new Error("Không tìm thấy thực đơn ngày này!");

  // 2. Tìm vị trí món ăn bằng recipeItemId
  const recipeIndex = dailyMenu.recipes.findIndex(
    (item) => item._id.toString() === recipeItemId.toString(),
  );

  if (recipeIndex === -1)
    throw new Error("Món ăn không tồn tại trong thực đơn!");

  const targetRecipe = dailyMenu.recipes[recipeIndex];
  const nutrients = ["calories", "protein", "fat", "carbs"];
  nutrients.forEach((field) => {
    const totalToRemove =
      (targetRecipe.nutrition[field] || 0) * targetRecipe.scale;
    dailyMenu.totalNutrition[field] -= totalToRemove;

    // Đảm bảo không bị âm do sai số dấu phẩy động (floating point)
    if (dailyMenu.totalNutrition[field] < 0)
      dailyMenu.totalNutrition[field] = 0;
  });

  dailyMenu.recipes.splice(recipeIndex, 1);

  return await dailyMenu.save();
};

exports.getDailyMenuByDate = async ({ userId, date }) => {
  const normalizedDate = toDateOnly("2025-02-13");

  return await DailyMenu.findOne({
    userId,
    date: normalizedDate,
  }).lean();
};
exports.getDailyMenusByRange = async ({ userId, startDate, endDate }) => {
  const normalizedStartDate = toDateOnly(startDate);
  const normalizedEndDate = toDateOnly(endDate);

  return await DailyMenu.find({
    userId,
    date: {
      $gte: normalizedStartDate,
      $lte: normalizedEndDate,
    },
  })
    .lean()
    .sort({ date: 1 });
};
exports.createDailyMenu = async (data) => {
  try {
    let { userId, date, recipes, status } = data;

    if (!userId || !date) {
      throw new Error("Thiếu userId hoặc date.");
    }
    // Normalize date TRƯỚC KHI tìm existing để đảm bảo match đúng
    date = normalizeDate(date);
    // Tìm existing menu - nếu có nhiều, lấy cái mới nhất (tránh trùng rác cũ)
    let existing = await DailyMenu.findOne({ userId, date }).sort({
      createdAt: -1,
    });

    const normalizedRecipes = await Promise.all(
      (recipes || []).map(async (r) => {
        const recipeItem = {
          recipeId: r.recipeId,
          scale: r.scale || 1,
          status: r.status || "suggested",
          servingTime: r.servingTime || "other",
        };
        return recipeItem;
      }),
    );

    const totalNutrition = await calculateTotalNutrition(normalizedRecipes);

    if (!existing) {
      // Tạo mới
      const created = await DailyMenu.create({
        userId,
        date,
        recipes: normalizedRecipes,
        totalNutrition,
        status: status || "suggested",
      });

      //  Populate recipes.recipeId để trả về đầy đủ thông tin
      await created.populate({
        path: "recipes.recipeId",
        model: "Recipe",
        match: { deleted: { $ne: true } },
        select: "name description imageUrl totalNutrition",
      });
      // Filter out recipes that failed to populate (i.e., deleted)
      created.recipes = created.recipes.filter((r) => r.recipeId);

      return { type: "created", data: created };
    }
    existing.recipes = normalizedRecipes;
    existing.totalNutrition = totalNutrition;
    if (status) existing.status = status;

    await existing.save();

    //  Populate recipes.recipeId để trả về đầy đủ thông tin
    await existing.populate({
      path: "recipes.recipeId",
      model: "Recipe",
      match: { deleted: { $ne: true } },
      select: "name description imageUrl totalNutrition",
    });
    // Filter out recipes that failed to populate (i.e., deleted)
    existing.recipes = existing.recipes.filter((r) => r.recipeId);

    return { type: "updated", data: existing };
  } catch (error) {
    console.error("Lỗi upsert DailyMenu:", error);
    throw new Error("Không thể lưu thực đơn: " + error.message);
  }
};
