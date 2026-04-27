/**
 * chatTools.executor.js
 *
 * Nhận { name, args } từ Gemini Function Calling
 * → gọi đúng service nội bộ
 * → trả về { success, data, summary } để Gemini tiếp tục tạo response
 *
 * Không import controller, không gọi HTTP — gọi thẳng service.
 */

const recipeService = require("./recipe.service");
const dailyMenuService = require("./dailyMenu.service");
const mealLogService = require("./mealLog.service");
const NutritionGoal = require("../models/NutritionGoal");
const mealRecommendationService = require("./mealRecommendation.service");
const Ingredient = require("../models/Ingredient");
const { findExercises, getExerciseById } = require("./exercise.service");
const favoriteService = require("./favorite.service");

// Helper: lấy ngày hôm nay dạng YYYY-MM-DD theo giờ VN
function getTodayVN() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/**
 * Điểm vào duy nhất — router theo tool name
 *
 * @param {string} toolName  - tên tool Gemini gọi
 * @param {Object} args      - arguments Gemini truyền vào
 * @param {string} userId    - user hiện tại (từ req.user._id)
 * @returns {Object}         - { success, data, summary, error? }
 */
async function executeTool(toolName, args, userId) {
  try {
    switch (toolName) {
      case "search_recipes":
        return await _searchRecipes(args, userId);

      case "get_recipe_detail":
        return await _getRecipeDetail(args);

      case "get_daily_menu":
        return await _getDailyMenu(args, userId);

      case "add_recipe_to_daily_menu":
        return await _addRecipeToDailyMenu(args, userId);

      case "suggest_daily_menu":
        return await _suggestDailyMenu(args, userId);

      case "suggest_week_plan":
        return await _suggestWeekPlan(args, userId);

      case "get_nutrition_goal":
        return await _getNutritionGoal(userId);

      case "get_meal_history":
        return await _getMealHistory(args, userId);
      case "search_ingredients":
        return await _searchIngredients(args);

      case "get_ingredient_detail":
        return await _getIngredientDetail(args);

      case "search_exercises":
        return await _searchExercises(args);

      case "get_exercise_detail":
        return await _getExerciseDetail(args);

      case "get_favorite_recipes":
        return await _getFavoriteRecipes(args, userId);

      case "add_favorite_recipe":
        return await _addFavoriteRecipe(args, userId);

      case "remove_favorite_recipe":
        return await _removeFavoriteRecipe(args, userId);

      default:
        return {
          success: false,
          error: `Tool "${toolName}" chưa được hỗ trợ`,
          summary: `Không tìm thấy tool ${toolName}`,
        };
    }
  } catch (err) {
    console.error(`[ToolExecutor] ${toolName} error:`, err.message);
    return {
      success: false,
      error: err.message,
      summary: `Lỗi khi thực hiện ${toolName}: ${err.message}`,
    };
  }
}

// ─── RECIPE ──────────────────────────────────────────────────────────────────

async function _searchRecipes(args, userId) {
  const { keyword, limit = 5 } = args;

  const result = await recipeService.searchRecipesByIngredientName(keyword, {
    limit,
    page: 1,
  });

  // Chỉ trả về fields cần thiết, tránh gửi cả document lên Gemini
  const simplified = result.recipes.map((r) => ({
    _id: r._id,
    name: r.name,
    category: r.category,
    calories:
      r.totalNutrition?.calories || r.totalNutritionPerServing?.calories,
    nutritionPerServing: r.totalNutritionPerServing,
    nutrition: r.totalNutrition,
    description: r.description?.substring(0, 100),
    imageUrl: r.imageUrl,
  }));
console.log("result recipes:", result.recipes );
  return {
    success: true,
    data: simplified,
    total: result.total,
    summary:
      simplified.length > 0
        ? `Tìm thấy ${result.total} món với từ khoá "${keyword}". ` +
          `Top ${simplified.length}: ${simplified.map((r) => r.name).join(", ")}.`
        : `Không tìm thấy món nào với từ khoá "${keyword}".`,
  };
}

async function _getRecipeDetail(args) {
  const { recipe_id } = args;
  const recipe = await recipeService.getRecipeById(recipe_id);
console.log("result recipe:", recipe );

  if (!recipe) {
    return {
      success: false,
      error: "Không tìm thấy món ăn",
      summary: `Không tìm thấy recipe với ID ${recipe_id}`,
    };
  }

  return {
    success: true,
    data: {
      _id: recipe._id,
      name: recipe.name,
      description: recipe.description,
      category: recipe.category,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      nutrition: recipe.totalNutritionPerServing || recipe.totalNutrition,
    },
    summary: `Chi tiết món "${recipe.name}": ${recipe.ingredients?.length || 0} nguyên liệu, ${
      (recipe.totalNutritionPerServing || recipe.totalNutrition)?.calories || 0
    } kcal/khẩu phần.`,
  };
}

// ─── DAILY MENU ───────────────────────────────────────────────────────────────

async function _getDailyMenu(args, userId) {
  const date = args.date || getTodayVN();

  const menu = await dailyMenuService.getDailyMenuByDate({ userId, date });

  if (!menu || !menu.recipes?.length) {
    return {
      success: true,
      data: null,
      summary: `Chưa có thực đơn cho ngày ${date}. Bạn có thể gợi ý thực đơn mới.`,
    };
  }

  // Chỉ trả về summary dinh dưỡng + danh sách tên món
  const recipeSummary = menu.recipes.map((r) => ({
    name: r.name,
    servingTime: r.servingTime,
    scale: r.scale,
    calories: r.nutrition?.calories,
    isChecked: r.isChecked,
  }));

  return {
    success: true,
    data: {
      _id: menu._id,
      date: menu.date,
      status: menu.status,
      recipes: recipeSummary,
      totalNutrition: menu.totalNutrition,
      targetNutrition: menu.targetNutrition,
    },
    summary:
      `Thực đơn ngày ${date}: ${recipeSummary.length} món, ` +
      `tổng ${menu.totalNutrition?.calories || 0} kcal. ` +
      `Các món: ${recipeSummary.map((r) => `${r.name} (${r.servingTime})`).join(", ")}.`,
  };
}

async function _addRecipeToDailyMenu(args, userId) {
  const { recipe_id, date, serving_time = "other", scale = 1 } = args;

  const result = await dailyMenuService.addRecipeToMenu({
    userId,
    date,
    recipeId: recipe_id,
    scale,
    servingTime: serving_time,
  });

  const addedRecipe = result.recipes[result.recipes.length - 1];

  return {
    success: true,
    data: {
      dailyMenuId: result._id,
      addedRecipe: {
        name: addedRecipe?.name,
        servingTime: addedRecipe?.servingTime,
        scale: addedRecipe?.scale,
      },
      newTotalCalories: result.totalNutrition?.calories,
    },
    summary:
      `Đã thêm "${addedRecipe?.name}" vào bữa ${serving_time} ngày ${date}. ` +
      `Tổng calo ngày đó hiện là ${result.totalNutrition?.calories || 0} kcal.`,
  };
}

async function _suggestDailyMenu(args, userId) {
  const date = args.date || getTodayVN();

  const result = await mealRecommendationService.recommendDayPlan(userId, {
    date: new Date(date),
  });

  // Nhóm theo bữa ăn để dễ đọc
  const byMeal = {};
  (result.recipes || []).forEach((r) => {
    const meal = r.servingTime || "other";
    if (!byMeal[meal]) byMeal[meal] = [];
    byMeal[meal].push(r.name);
  });

  const mealSummary = Object.entries(byMeal)
    .map(([meal, names]) => `${meal}: ${names.join(", ")}`)
    .join("; ");

  return {
    success: true,
    data: {
      _id: result._id,
      date: result.date,
      totalNutrition: result.totalNutrition,
      targetNutrition: result.targetNutrition,
      byMeal,
    },
    summary:
      `Đã tạo thực đơn gợi ý cho ngày ${date}: ${mealSummary}. ` +
      `Tổng: ${result.totalNutrition?.calories || 0} kcal ` +
      `(mục tiêu: ${result.targetNutrition?.calories || 0} kcal).`,
  };
}

async function _suggestWeekPlan(args, userId) {
  const {
    start_date,
    days = 7,
    save_to_db = false, // mặc định false để an toàn
  } = args;

  const result = await mealRecommendationService.recommendWeekPlan(userId, {
    startDate: new Date(start_date),
    days: Math.min(days, 14),
    saveToDB: save_to_db,
  });

  return {
    success: true,
    data: {
      startDate: result.startDate,
      endDate: result.endDate,
      days: result.dailyMenu?.length,
      weeklyTotal: result.weeklyTotal,
      weeklyAverage: result.weeklyAverage,
      savedToDB: save_to_db,
      // Chỉ trả về tên món, tránh payload quá lớn
      planSummary: (result.dailyMenu || []).map((day) => ({
        date: day.date,
        totalCalories: day.totalNutrition?.calories,
        recipes: day.recipes?.map((r) => r.name),
      })),
    },
    summary:
      `Đã ${save_to_db ? "lưu" : "tạo (chưa lưu)"} kế hoạch ${days} ngày từ ${start_date}. ` +
      `Trung bình ${result.weeklyAverage?.calories || 0} kcal/ngày. ` +
      (save_to_db
        ? "Kế hoạch đã được lưu vào hệ thống."
        : "Nhắn 'xác nhận' để lưu vào hệ thống."),
  };
}

// ─── NUTRITION GOAL ───────────────────────────────────────────────────────────

async function _getNutritionGoal(userId) {
  const goal = await NutritionGoal.findOne({
    userId,
    status: "active",
  }).lean();

  if (!goal) {
    return {
      success: false,
      error: "Chưa có mục tiêu dinh dưỡng",
      summary:
        "User chưa thiết lập mục tiêu dinh dưỡng. Cần cập nhật thông tin cân nặng, chiều cao, mục tiêu.",
    };
  }

  const t = goal.targetNutrition;
  return {
    success: true,
    data: {
      targetNutrition: t,
      bodySnapshot: goal.bodySnapshot,
      status: goal.status,
      createdAt: goal.createdAt,
    },
    summary:
      `Mục tiêu dinh dưỡng: ${t?.calories || 0} kcal/ngày, ` +
      `protein ${t?.protein || 0}g, carbs ${t?.carbs || 0}g, fat ${t?.fat || 0}g. ` +
      `Mục tiêu: ${goal.bodySnapshot?.goal || "chưa rõ"}.`,
  };
}

// ─── MEAL LOG ────────────────────────────────────────────────────────────────

async function _getMealHistory(args, userId) {
  const { days = 7 } = args;

  const result = await mealLogService.getMealHistory(userId, {
    days,
    page: 1,
    limit: 20,
  });

  // Nhóm theo ngày
  const byDay = {};
  result.logs.forEach((log) => {
    const day = new Date(log.eatenAt).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push({
      name: log.recipe?.name,
      calories: log.recipe?.nutrition?.calories,
    });
  });

  const stats = await mealLogService.getMealStats(userId, { days });

  return {
    success: true,
    data: {
      byDay,
      stats,
      totalLogs: result.pagination.total,
    },
    summary:
      `${days} ngày qua: ${result.pagination.total} bữa ăn, ` +
      `tổng ${stats.totalCalories || 0} kcal, ` +
      `trung bình ${stats.averagePerDay || 0} kcal/ngày.`,
  };
}
// ─── INGREDIENT ───────────────────────────────────────────────────────────────

async function _searchIngredients(args) {
  const { keyword, category } = args;

  const query = {
    $or: [
      { name: { $regex: keyword, $options: "i" } },
      { name_en: { $regex: keyword, $options: "i" } },
      { aliases: { $elemMatch: { $regex: keyword, $options: "i" } } },
    ],
  };
  if (category) query.category = category;

  const ingredients = await Ingredient.find(query).limit(8).lean();

  if (!ingredients.length) {
    return {
      success: true,
      data: [],
      summary: `Không tìm thấy nguyên liệu nào với từ khoá "${keyword}".`,
    };
  }

  const simplified = ingredients.map((i) => ({
    _id: i._id,
    name: i.name,
    name_en: i.name_en,
    category: i.category,
    unit: i.unit,
    nutrition: {
      calories: i.nutrition?.calories,
      protein: i.nutrition?.protein,
      carbs: i.nutrition?.carbs,
      fat: i.nutrition?.fat,
      fiber: i.nutrition?.fiber,
    },
  }));

  return {
    success: true,
    data: simplified,
    summary:
      `Tìm thấy ${ingredients.length} nguyên liệu cho "${keyword}": ` +
      simplified
        .map(
          (i) =>
            `${i.name} (${i.nutrition?.calories || 0} kcal/100g, ` +
            `protein: ${i.nutrition?.protein || 0}g, ` +
            `carbs: ${i.nutrition?.carbs || 0}g, ` +
            `fat: ${i.nutrition?.fat || 0}g)`,
        )
        .join("; "),
  };
}

async function _getIngredientDetail(args) {
  const { ingredient_id } = args;
  const ingredient = await Ingredient.findById(ingredient_id).lean();

  if (!ingredient) {
    return {
      success: false,
      error: "Không tìm thấy nguyên liệu",
      summary: `Không tìm thấy nguyên liệu với ID ${ingredient_id}`,
    };
  }

  return {
    success: true,
    data: ingredient,
    summary:
      `${ingredient.name}: ${ingredient.nutrition?.calories || 0} kcal/100g, ` +
      `protein ${ingredient.nutrition?.protein || 0}g, ` +
      `carbs ${ingredient.nutrition?.carbs || 0}g, ` +
      `fat ${ingredient.nutrition?.fat || 0}g, ` +
      `fiber ${ingredient.nutrition?.fiber || 0}g. ` +
      `Nhóm: ${ingredient.category}.`,
  };
}

// ─── EXERCISE ────────────────────────────────────────────────────────────────

async function _searchExercises(args) {
  const { category_id, muscle_ids, equipment_ids } = args;

  const exercises = await findExercises({
    categoryId: category_id,
    muscleIds: muscle_ids,
    equipmentIds: equipment_ids,
  });

  // Giới hạn 6 kết quả để tránh token quá lớn
  const limited = exercises.slice(0, 6);

  if (!limited.length) {
    return {
      success: true,
      data: [],
      summary: "Không tìm thấy bài tập phù hợp với tiêu chí đã chọn.",
    };
  }

  const simplified = limited.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    category: e.category,
    muscles: e.muscles?.map((m) => m.name_en || m.name).slice(0, 3),
    equipment: e.equipment?.map((eq) => eq.name).slice(0, 2),
    defaultIntensity: e.defaultIntensity,
  }));

  return {
    success: true,
    data: simplified,
    total: exercises.length,
    summary:
      `Tìm thấy ${exercises.length} bài tập, hiển thị ${limited.length}: ` +
      simplified
        .map(
          (e) =>
            `${e.name} (${e.category}, nhóm cơ: ${e.muscles?.join(", ") || "chung"})`,
        )
        .join("; "),
  };
}

async function _getExerciseDetail(args) {
  const { exercise_id } = args;
  const exercise = await getExerciseById(exercise_id);

  if (!exercise) {
    return {
      success: false,
      error: "Không tìm thấy bài tập",
      summary: `Không tìm thấy bài tập với ID ${exercise_id}`,
    };
  }

  return {
    success: true,
    data: {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      description: exercise.description?.substring(0, 300),
      category: exercise.category,
      muscles: exercise.muscles,
      muscles_secondary: exercise.muscles_secondary,
      equipment: exercise.equipment,
      defaultIntensity: exercise.defaultIntensity,
      activityType: exercise.activityType,
    },
    summary:
      `${exercise.name}: ${exercise.description?.substring(0, 100) || ""}. ` +
      `Nhóm cơ chính: ${exercise.muscles?.map((m) => m.name_en || m.name).join(", ") || "không rõ"}. ` +
      `Thiết bị: ${exercise.equipment?.map((e) => e.name).join(", ") || "không cần"}. ` +
      `Cường độ: ${exercise.defaultIntensity || "moderate"}.`,
  };
}

// ─── FAVORITE ────────────────────────────────────────────────────────────────

async function _getFavoriteRecipes(args, userId) {
  const { limit = 10 } = args;

  const result = await favoriteService.getFavoriteRecipes(userId, {
    limit,
    page: 1,
  });

  if (!result.recipes.length) {
    return {
      success: true,
      data: [],
      summary: "User chưa có món ăn yêu thích nào.",
    };
  }

  const simplified = result.recipes.map((r) => ({
    _id: r._id,
    name: r.name,
    category: r.category,
    calories:
      r.totalNutritionPerServing?.calories || r.totalNutrition?.calories,
    imageUrl: r.imageUrl,
  }));

  return {
    success: true,
    data: simplified,
    total: result.total,
    summary:
      `User có ${result.total} món yêu thích. ` +
      `Danh sách: ${simplified.map((r) => r.name).join(", ")}.`,
  };
}

async function _addFavoriteRecipe(args, userId) {
  const { recipe_id } = args;

  try {
    await favoriteService.addFavorite(userId, recipe_id);

    return {
      success: true,
      data: { recipe_id, added: true },
      summary: `Đã thêm món ăn vào danh sách yêu thích thành công.`,
    };
  } catch (err) {
    // Trường hợp đã có trong danh sách — không phải lỗi nghiêm trọng
    if (err.message?.includes("đã có")) {
      return {
        success: false,
        error: "already_exists",
        summary: "Món ăn này đã có trong danh sách yêu thích rồi.",
      };
    }
    throw err;
  }
}

async function _removeFavoriteRecipe(args, userId) {
  const { recipe_id } = args;

  try {
    await favoriteService.removeFavorite(userId, recipe_id);

    return {
      success: true,
      data: { recipe_id, removed: true },
      summary: `Đã xóa món ăn khỏi danh sách yêu thích.`,
    };
  } catch (err) {
    if (err.message?.includes("không có")) {
      return {
        success: false,
        error: "not_found",
        summary: "Món ăn này không có trong danh sách yêu thích.",
      };
    }
    throw err;
  }
}

module.exports = { executeTool };
