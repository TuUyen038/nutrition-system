const DailyMenu = require("../models/DailyMenu");
const MealPlan = require("../models/MealPlan");
const { calculateTotalNutrition } = require("../utils/calTotalNutri");
const mongoose = require("mongoose");
const { normalizeDate } = require("../utils/date");
const User = require("../models/User");
const NutritionGoal = require("../models/NutritionGoal");
const Recipe = require("../models/Recipe");

async function getUserDailyTarget(userId) {
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
async function pickRecipeForMeal({
  user,
  targetCalories,
  preferredCategories = [],
  usageStats,
}) {
  const { countMap, last3DaysSet } = usageStats || {
    countMap: new Map(),
    last3DaysSet: new Set(),
  };

  const query = {
    deleted: { $ne: true }, //  Filter deleted
  };

  if (preferredCategories.length) {
    query.category = { $in: preferredCategories };
  }

  if (user?.bannedIngredients?.length) {
    query["ingredients.name"] = { $nin: user.bannedIngredients };
  }

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

    const randomNoise = Math.random() * 30; // tạo chút ngẫu nhiên

    const score = diffCal + penaltyRecent + penaltyFreq + randomNoise;

    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}
exports.suggestDailyMenu = async ({ userId, dateStr }) => {
  const { user, target } = await getUserDailyTarget(userId);

  const MEAL_TYPES = ["breakfast", "lunch", "dinner"];
  const MEAL_DISTRIBUTION = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.3,
    // 10% còn lại dành cho snack (chưa xử lý)
  };

  const targetCaloriesPerMeal = {};
  for (const m of MEAL_TYPES) {
    targetCaloriesPerMeal[m] = (target.calories || 0) * MEAL_DISTRIBUTION[m];
  }

  const recipesPlanned = [];
  const usedRecipeIds = [];
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
    // bạn có thể tùy biến mapping mealType -> category
    // ví dụ:
    let preferredCategories = [];
    if (mealType === "breakfast") {
      preferredCategories = ["main", "drink"];
    } else if (mealType === "lunch" || mealType === "dinner") {
      preferredCategories = ["main", "side"];
    }

    const recipe = await pickRecipeForMeal({
      user,
      targetCalories: targetCaloriesPerMeal[mealType],
      excludedRecipeIds: usedRecipeIds,
      preferredCategories,
    });

    if (!recipe) continue;

    usedRecipeIds.push(recipe._id);

    const portion = 1; //mặc định là 1. Sau này mở rộng có thể chọn trùng món trong 1 ngày thì biến này sẽ được set lại

    recipesPlanned.push({
      recipeId: recipe._id,
      portion: portion,
      servingTime: mealType,
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
  const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

  nutritionSum.calories = round2(nutritionSum.calories);
  nutritionSum.protein = round2(nutritionSum.protein);
  nutritionSum.fat = round2(nutritionSum.fat);
  nutritionSum.carbs = round2(nutritionSum.carbs);
  nutritionSum.fiber = round2(nutritionSum.fiber);
  nutritionSum.sugar = round2(nutritionSum.sugar);
  nutritionSum.sodium = round2(nutritionSum.sodium);

  const dailyMenu = await DailyMenu.create({
    userId,
    date: dateStr, // "YYYY-MM-DD"
    recipes: recipesPlanned,
    totalNutrition: nutritionSum,
  });

  return dailyMenu;
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
          portion: r.portion || 1,
          note: r.note || "",
          status: r.status || "planned",
          servingTime: r.servingTime || "other",
        };

        //  Tạo snapshot nếu status = "eaten"
        // if (recipeItem.status === "eaten") {
        //   const snapshot = await createRecipeSnapshot(r.recipeId);
        //   if (snapshot) {
        //     recipeItem.recipeSnapshot = snapshot;
        //   }
        // }

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
        status: status || "planned",
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

// exports.getMealHistory = async (userId) => {
//   return DailyMenu.find({ userId, status: "completed" })
//     .sort({ date: -1 })
//     .populate({
//       path: "recipes._id",
//       model: "Recipe",
//       select: "date name imageUrl totalNutrition",
//     });
// };

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

exports.addRecipeToMeal = async (userId, mealData) => {
  const { date, mealType, recipeId, portion = 1 } = mealData;
  let meal = await DailyMenu.findOne({
    userId,
    date: new Date(date),
    mealType,
    status: { $in: ["selected", "planned"] },
  });

  let isNewMeal = false;
  let originalMeal = null; // Biến để giữ bản ghi gốc (nếu là gợi ý AI)

  if (!meal) {
    meal = new Meal({
      userId,
      date: new Date(date),
      mealType,
      source: "user",
      status: "planned",
      recipes: [],
    });
    isNewMeal = true;
  } else if (meal.status === "suggested") {
    originalMeal = meal;

    originalMeal.status = "selected";
    await originalMeal.save();

    const clonedMealData = originalMeal.toObject();
    delete clonedMealData._id;
    delete clonedMealData.createdAt;
    delete clonedMealData.updatedAt;

    meal = new DailyMenu({
      ...clonedMealData,
      _id: new mongoose.Types.ObjectId(), // Gán ID mới
      // source: "user", // Nguồn là người dùng đã chỉnh sửa
      status: "edited",
      originalMealId: originalMeal._id,
    });

    if (originalMeal.mealPlanId) {
      exports.updateMealPlanOnMealClone(
        originalMeal.mealPlanId,
        oldMealId,
        meal._id, // ID của Meal B
      );
    }
  }

  const newRecipe = { recipeId, portion, mealType };

  const existingRecipe = meal.recipes.find(
    (r) => r.recipeId.toString() === recipeId,
  );
  if (existingRecipe) {
    existingRecipe.portion += portion;
  } else {
    meal.recipes.push(newRecipe);
  }

  meal.totalNutrition = await calculateTotalNutrition(meal.recipes);

  await meal.save();
  return meal;
};

// hàm markMealAsEaten dùng update/create meallog khi gọi hàm updateMealStatus
async function markMealAsEaten({ userId, recipeItem, date }) {
  // check đã có log chưa (idempotent)
  const existed = await MealLog.findOne({
    userId,
    recipeItemId: recipeItem._id,
  });

  if (existed) return;

  await MealLog.create({
    userId,
    recipeId: recipeItem.recipeId,
    recipeItemId: recipeItem._id,
    calories: recipeItem.recipeId.totalNutrition?.calories,
    protein: recipeItem.recipeId.totalNutrition?.protein,
    fat: recipeItem.recipeId.totalNutrition?.fat,
    carbs: recipeItem.recipeId.totalNutrition?.carbs,
    date,
    source: "planned",
  });
}

exports.updateMealStatus = async (mealId, newStatus) => {
  // mealId là _id của một recipe item trong array recipes của DailyMenu
  // Cần tìm DailyMenu chứa recipe item này và cập nhật status

  const validStatuses = ["planned", "eaten", "deleted"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(
      `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(", ")}`,
    );
  }

  // Tìm DailyMenu chứa recipe item có _id = mealId
  const dailyMenu = await DailyMenu.findOne({
    "recipes._id": mealId,
  });

  if (!dailyMenu) {
    throw new Error("Recipe item not found in daily menu");
  }

  // Validation: Kiểm tra window 7 ngày và chặn ngày tương lai
  const STATUS_UPDATE_WINDOW_DAYS = 7;
  const menuDate = new Date(dailyMenu.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  menuDate.setHours(0, 0, 0, 0);

  // Chặn tick "đã ăn" cho ngày tương lai
  if (menuDate > today) {
    throw new Error("Không thể đánh dấu đã ăn cho ngày tương lai.");
  }

  const diffTime = today - menuDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > STATUS_UPDATE_WINDOW_DAYS) {
    throw new Error(
      `Không thể cập nhật status. Ngày này đã quá ${STATUS_UPDATE_WINDOW_DAYS} ngày và đã được đóng băng để đảm bảo tính chính xác của báo cáo.`,
    );
  }

  // Tìm và cập nhật status của recipe item
  const recipeItem = dailyMenu.recipes.id(mealId);
  if (!recipeItem) {
    throw new Error("Recipe item not found");
  }

  recipeItem.status = newStatus;

  // Lưu DailyMenu để cập nhật recipe item
  await dailyMenu.save();

  // Nếu chuyển sang "eaten", tạo log trong Meallog
  if (newStatus === "eaten") {
    await markMealAsEaten({
      userId: dailyMenu.userId,
      recipeItem,
      date: dailyMenu.date,
    });
  } else {
    await MealLog.deleteOne({ recipeItemId: mealId });
  }

  // Populate recipeId để trả về đầy đủ thông tin
  await dailyMenu.populate({
    path: "recipes.recipeId",
    model: "Recipe",
  });

  // Trả về recipe item đã được cập nhật
  const updatedRecipeItem = dailyMenu.recipes.id(mealId);

  return {
    _id: updatedRecipeItem._id,
    recipeId: updatedRecipeItem.recipeId,
    name: updatedRecipeItem.recipeId?.name,
    imageUrl: updatedRecipeItem.recipeId?.imageUrl,
    totalNutrition: updatedRecipeItem.recipeId?.totalNutrition,
    description: updatedRecipeItem.recipeId?.description,
    portion: updatedRecipeItem.portion,
    note: updatedRecipeItem.note,
    status: updatedRecipeItem.status,
  };
};

// exports.updateMeal = async (mealId, updateData, userId) => {
//   let meal = await Meal.findById(mealId);

//   if (!meal) {
//     throw new Error("Meal not found.");
//   }
//   const oldStatus = meal.status;
//   const oldMealId = meal._id;
//   let newMeal = meal; // Mặc định là bản gốc, sẽ thay đổi nếu có clone
//   if (meal.source === "ai" && oldStatus === "suggested" && updateData.recipes) {
//     meal.status = "archived_suggestion";
//     await meal.save();

//     const clonedMealData = meal.toObject();
//     delete clonedMealData._id;
//     delete clonedMealData.createdAt;
//     delete clonedMealData.updatedAt;

//     newMeal = new Meal({
//       ...clonedMealData,
//       _id: new mongoose.Types.ObjectId(),
//       source: "user", // Nguồn từ người dùng (đã chỉnh sửa/chốt)
//       status: "edited", // Trạng thái là bản đã được chỉnh sửa
//       originalMealId: oldMealId, // Trỏ về bản gốc A (để truy vết)
//     });

//     if (meal.mealPlanId) {
//       await MealPlanService.updateMealPlanOnMealClone(
//         meal.mealPlanId,
//         oldMealId,
//         newMeal._id
//       );
//     }
//   }
//   if (updateData.recipes) {
//     newMeal.recipes = updateData.recipes;
//   }

//   Object.keys(updateData).forEach((key) => {
//     // Tránh ghi đè các trường cố định
//     if (
//       key !== "recipes" &&
//       key !== "userId" &&
//       key !== "mealPlanId" &&
//       newMeal[key] !== undefined
//     ) {
//       newMeal[key] = updateData[key];
//     }
//   });
//   if (updateData.status && updateData.status !== newMeal.status) {
//     newMeal.status = updateData.status;
//   }
//   newMeal.totalNutrition = await calculateTotalNutrition(newMeal.recipes);
//   await newMeal.save();
//   return newMeal;
// };
