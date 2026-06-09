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
const ingredientService = require("./ingredient.service");
const { CHAT_TOOLS } = require("./chatTools.definition");

// Helper: lấy ngày hôm nay dạng YYYY-MM-DD theo giờ VN
function getTodayVN() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(id);

/**
 * Generic helper: format user selection prompt cho search tools
 * Dùng cho bất kỳ search tool nào có userSelection config
 *
 * @param {string} toolName - tên tool (e.g., 'search_ingredients')
 * @param {Array} data - danh sách kết quả từ tool
 * @param {Object} selectionConfig - config từ tool definition
 * @returns {Object} { itemsList, instruction } - danh sách + instruction để hiển thị
 */
function formatUserSelectionPrompt(toolName, data, selectionConfig) {
  if (!Array.isArray(data) || data.length === 0) {
    return { itemsList: "", instruction: "" };
  }

  const { displayField } = selectionConfig;

  // Tạo numbered list
  const itemsList = data
    .map((item, idx) => `${idx + 1}) ${item[displayField]}`)
    .join("\n");

  const instruction =
    `Danh sách kết quả:\n${itemsList}\n\n` +
    `${selectionConfig.selectionPrompt}\n` +
    `(Bạn có thể nói số thứ tự hoặc tên của mục muốn xem chi tiết)`;

  return { itemsList, instruction };
}

/**
 * Helper: lấy tool config từ CHAT_TOOLS
 *
 * @param {string} toolName - tên tool
 * @returns {Object|null} - tool config hoặc null nếu không tìm thấy
 */
function getToolConfig(toolName) {
  return CHAT_TOOLS.find((t) => t.name === toolName);
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

      case "update_daily_menu_status":
        return await _updateDailyMenuStatus(args, userId);
        
      case "add_recipe_to_daily_menu":
        return await _addRecipeToDailyMenu(args, userId);

      case "suggest_daily_menu":
        return await _suggestDailyMenu(args, userId);

      case "update_recipe_in_menu":
        return await _updateRecipeInMenu(args, userId);

      case "delete_recipe_in_menu":
        return await _deleteRecipeInMenu(args, userId);

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
  console.log("result recipes:", result.recipes);

  // Check tool config để xem có userSelection không
  const toolConfig = getToolConfig("search_recipes");
  let summary =
    simplified.length > 0
      ? `Tìm thấy ${result.total} món với từ khoá "${keyword}". ` +
        `Top ${simplified.length}: ${simplified.map((r) => r.name).join(", ")}.`
      : `Không tìm thấy món nào với từ khoá "${keyword}".`;

  // Nếu có nhiều kết quả (>1) và tool có userSelection enabled → format selection prompt
  if (simplified.length > 1 && toolConfig?.userSelection?.enabled) {
    const { itemsList, instruction } = formatUserSelectionPrompt(
      "search_recipes",
      simplified,
      toolConfig.userSelection,
    );
    summary = instruction;
  }

  return {
    success: true,
    data: simplified,
    total: result.total,
    summary,
    userSelection:
      toolConfig?.userSelection?.enabled && simplified.length > 1
        ? {
            enabled: true,
            toolName: "search_recipes",
            detailToolName: toolConfig.userSelection.detailToolName,
            paramName: toolConfig.userSelection.paramName,
          }
        : undefined,
  };
}

async function _getRecipeDetail(args) {
  const { recipe_id } = args;
  const recipe = await recipeService.getRecipeById(recipe_id);
  console.log("result recipe:", recipe);

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
  const statusFilter = args.status_filter || "active";
 
  const STATUS_MAP = {
    active:    ["manual", "selected"],
    suggested: ["suggested"],
  };
  const statuses = STATUS_MAP[statusFilter] || STATUS_MAP.active;
 
  const menus = await dailyMenuService.getDailyMenusByDateAndStatus({
    userId,
    date,
    statuses,
  });
 
  if (!menus.length) {
    const hint =
      statusFilter === "suggested"
        ? `Chưa có thực đơn gợi ý cho ngày ${date}. Hỏi người dùng có muốn hệ thống tạo gợi ý không. Không được tự gọi hàm khác.`
        : `Chưa có thực đơn cho ngày ${date}. Nếu user chưa có thực đơn nào cho ngày này, hãy hỏi user có muốn hệ thống gợi ý thực đơn không. `;
    return { success: true, data: [], summary: hint };
  }
 
  const formattedMenus = menus.map((menu) => {
    const recipeSummary = (menu.recipes || []).map((r) => ({
      recipeItemId: r._id,
      recipeId: r.recipeId,
      name: r.name,
      servingTime: r.servingTime,
      scale: r.scale,
      calories: r.nutrition?.calories,
      isChecked: r.isChecked,
    }));
 
    return {
      _id: menu._id,
      date: menu.date,
      status: menu.status,
      recipes: recipeSummary,
      totalNutrition: menu.totalNutrition,
      targetNutrition: menu.targetNutrition,
    };
  });
 
  // Summary include đủ ID để Gemini dùng cho các tool tiếp theo
  const summaryParts = formattedMenus.map((menu) => {
    const recipeList = menu.recipes
      .map((r) => `${r.name} (${r.servingTime}, scale: ${r.scale}, recipeItemId: ${r.recipeItemId})`)
      .join(", ");
    return (
      `[${menu.status}] menuId: ${menu._id} — ` +
      `${menu.recipes.length} món: ${recipeList || "chưa có món"}, ` +
      `tổng ${menu.totalNutrition?.calories || 0} kcal`
    );
  });
 console.log(">>>>summary:", summaryParts.join(" | "));
  return {
    success: true,
    data: formattedMenus,
    summary:
      `Thực đơn ngày ${date} (${statusFilter}): ` +
      summaryParts.join(" | ") +
      `. Dùng menuId cho update_daily_menu_status, recipeItemId cho update/delete recipe.`,
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
// chatTools.executor.js

async function _updateRecipeInMenu(args, userId) {
  const { daily_menu_id, recipe_item_id, new_scale, checked } = args;

  if (!isValidObjectId(daily_menu_id) || !isValidObjectId(recipe_item_id)) {
    return {
      success: false,
      error: "ID không hợp lệ",
      summary:
        "daily_menu_id hoặc recipe_item_id không hợp lệ. " +
        "Gọi get_daily_menu trước để lấy đúng menuId và recipeItemId.",
    };
  }

  if (new_scale === undefined && checked === undefined) {
    return {
      success: false,
      error: "Thiếu thông tin cập nhật",
      summary: "Cần cung cấp new_scale hoặc checked.",
    };
  }

  try {
    const result = await dailyMenuService.updateRecipeInMenu({
      userId,
      dailyMenuId: daily_menu_id,
      recipeItemId: recipe_item_id,
      newScale: typeof new_scale === "number" ? new_scale : undefined,
      checked,
    });

    const updatedItem = result.recipes.find(
      (r) => r._id?.toString() === recipe_item_id,
    );
    const changes = [];
    if (typeof new_scale === "number")
      changes.push(new_scale <= 0 ? "đã xoá món" : `khẩu phần → ${new_scale}`);
    if (checked === true) changes.push("đã đánh dấu đã ăn");
    if (checked === false) changes.push("bỏ đánh dấu đã ăn");

    return {
      success: true,
      data: {
        dailyMenuId: result._id,
        updatedItem: updatedItem
          ? { name: updatedItem.name, scale: updatedItem.scale, isChecked: updatedItem.isChecked }
          : null,
        newTotalNutrition: result.totalNutrition,
      },
      summary:
        `${changes.join(", ")}. Tổng calo: ${result.totalNutrition?.calories || 0} kcal.`,
    };
  } catch (err) {
    // Trả hint rõ để Gemini tự recover thay vì fallback
    return {
      success: false,
      error: err.message,
      summary:
        `Không thể cập nhật món ăn: ${err.message}. ` +
        `Gọi get_daily_menu(date: hôm nay) để lấy lại menuId và recipeItemId hợp lệ, sau đó thử lại.`,
    };
  }
}

async function _deleteRecipeInMenu(args, userId) {
  const { daily_menu_id, recipe_item_id } = args;

  if (!isValidObjectId(daily_menu_id) || !isValidObjectId(recipe_item_id)) {
    return {
      success: false,
      error: "ID không hợp lệ",
      summary:
        "daily_menu_id hoặc recipe_item_id không hợp lệ. " +
        "Gọi get_daily_menu trước để lấy đúng menuId và recipeItemId.",
    };
  }

  try {
    const result = await dailyMenuService.deleteRecipeInMenu({
      userId,
      dailyMenuId: daily_menu_id,
      recipeItemId: recipe_item_id,
    });

    return {
      success: true,
      data: {
        dailyMenuId: result._id,
        remainingCount: result.recipes.length,
        newTotalNutrition: result.totalNutrition,
      },
      summary:
        `Đã xoá món khỏi thực đơn. ` +
        `Còn ${result.recipes.length} món, tổng ${result.totalNutrition?.calories || 0} kcal.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      summary:
        `Không thể xoá món ăn: ${err.message}. ` +
        `Gọi get_daily_menu(date: hôm nay) để lấy lại menuId và recipeItemId hợp lệ, sau đó thử lại.`,
    };
  }
}

async function _updateDailyMenuStatus(args, userId) {
  const { daily_menu_id, new_status } = args;

  if (!isValidObjectId(daily_menu_id)) {
    return {
      success: false,
      error: "ID không hợp lệ",
      summary:
        "daily_menu_id không hợp lệ. " +
        "Gọi get_daily_menu trước để lấy đúng menuId.",
    };
  }

  const validStatuses = ["manual", "suggested", "selected", "completed", "deleted", "expired"];
  if (!validStatuses.includes(new_status)) {
    return {
      success: false,
      error: "Trạng thái không hợp lệ",
      summary: `Trạng thái "${new_status}" không hợp lệ. Chọn một trong: ${validStatuses.join(", ")}.`,
    };
  }

  try {
    const result = await dailyMenuService.updateDailyMenuStatus({
      userId,
      dailyMenuId: daily_menu_id,
      newStatus: new_status,
    });

    return {
      success: true,
      data: { dailyMenuId: result._id, newStatus: result.status },
      summary: `Đã cập nhật trạng thái thực đơn thành "${result.status}".`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      summary:
        `Không thể cập nhật trạng thái: ${err.message}. ` +
        `Gọi get_daily_menu(date: hôm nay) để lấy lại menuId hợp lệ, sau đó thử lại.`,
    };
  }
}
async function _suggestDailyMenu(args, userId) {
  const date = args.date || getTodayVN();
  const result = await mealRecommendationService.recommendDayPlan(userId, {
    date: new Date(date),
  });
  const byMeal = {};
  (result.recipes || []).forEach((r) => {
    const meal = r.servingTime || "other";
    if (!byMeal[meal]) byMeal[meal] = [];
    byMeal[meal].push(r.name);
  });
 
  const mealSummary = Object.entries(byMeal)
    .map(([meal, names]) => `${meal}: ${names.join(", ")}`)
    .join("; ");
 
  const menuId = result._id;
 
  return {
    success: true,
    data: {
      _id: menuId,
      date: result.date,
      totalNutrition: result.totalNutrition,
      targetNutrition: result.targetNutrition,
      byMeal,
    },
    summary:
      `Đã tạo thực đơn gợi ý cho ngày ${date} (menuId: ${menuId}): ${mealSummary}. ` +
      `Tổng: ${result.totalNutrition?.calories || 0} kcal ` +
      `(mục tiêu: ${result.targetNutrition?.calories || 0} kcal). ` +
      `Nếu user đồng ý lưu/chọn → gọi update_daily_menu_status(daily_menu_id: "${menuId}", new_status: "selected"). ` +
      `Hỏi user xác nhận và embed: [pending_action: update_daily_menu_status|daily_menu_id:${menuId}|new_status:selected]`,
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
  const { keyword } = args;
  console.log("[_searchIngredients] Searching for:", keyword);
  try {
    const query = {
      $or: [
        { name: { $regex: keyword, $options: "i" } },
        { name_en: { $regex: keyword, $options: "i" } },
        { aliases: { $elemMatch: { $regex: keyword, $options: "i" } } },
      ],
    };

    const ingredients = await Ingredient.find(query)
      .select("name name_en unit nutrition")
      .limit(10)
      .lean();
    if (!ingredients.length) {
      return {
        success: false, // <-- false để trigger fallback
        notFound: true, // <-- flag mới
        error: "NOT_IN_DB",
        summary: `Không tìm thấy "${keyword}" trong CSDL. Hãy tự tổng hợp thông tin dinh dưỡng từ kiến thức chung và ghi rõ "[Tham khảo bên ngoài]".`,
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

    // Check tool config để xem có userSelection không
    const toolConfig = getToolConfig("search_ingredients");
    let summary =
      `Tìm thấy ${ingredients.length} nguyên liệu cho "${keyword}": ` +
      simplified
        .map(
          (i) =>
            `${i.name} (${i.nutrition?.calories || 0} kcal/100g, ` +
            `protein: ${i.nutrition?.protein || 0}g, ` +
            `carbs: ${i.nutrition?.carbs || 0}g, ` +
            `fat: ${i.nutrition?.fat || 0}g)`,
        )
        .join("; ");

    // Nếu có nhiều kết quả (>1) và tool có userSelection enabled → format selection prompt
    if (simplified.length > 1 && toolConfig?.userSelection?.enabled) {
      const { itemsList, instruction } = formatUserSelectionPrompt(
        "search_ingredients",
        simplified,
        toolConfig.userSelection,
      );
      summary = instruction;
    }

    return {
      success: true,
      data: simplified,
      summary,
      userSelection:
        toolConfig?.userSelection?.enabled && simplified.length > 1
          ? {
              enabled: true,
              toolName: "search_ingredients",
              detailToolName: toolConfig.userSelection.detailToolName,
              paramName: toolConfig.userSelection.paramName,
            }
          : undefined,
    };
  } catch (err) {
    // Search engine chưa chạy / lỗi kết nối
    return {
      success: false,
      notFound: true,
      error: "DB_UNAVAILABLE",
      summary: `Không thể truy vấn CSDL cho "${keyword}". Hãy tự tổng hợp thông tin dinh dưỡng từ kiến thức chung và ghi rõ "[Tham khảo bên ngoài]".`,
    };
  }
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

  // Check tool config để xem có userSelection không
  const toolConfig = getToolConfig("search_exercises");
  let summary =
    `Tìm thấy ${exercises.length} bài tập, hiển thị ${limited.length}: ` +
    simplified
      .map(
        (e) =>
          `${e.name} (${e.category}, nhóm cơ: ${e.muscles?.join(", ") || "chung"})`,
      )
      .join("; ");

  // Nếu có nhiều kết quả (>1) và tool có userSelection enabled → format selection prompt
  if (simplified.length > 1 && toolConfig?.userSelection?.enabled) {
    const { itemsList, instruction } = formatUserSelectionPrompt(
      "search_exercises",
      simplified,
      toolConfig.userSelection,
    );
    summary = instruction;
  }

  return {
    success: true,
    data: simplified,
    total: exercises.length,
    summary,
    userSelection:
      toolConfig?.userSelection?.enabled && simplified.length > 1
        ? {
            enabled: true,
            toolName: "search_exercises",
            detailToolName: toolConfig.userSelection.detailToolName,
            paramName: toolConfig.userSelection.paramName,
          }
        : undefined,
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
  console.log(">>>>result favorite recipes:", result.recipes);
  const recipeList = simplified
    .map((r, idx) => `${idx + 1}. ${r.name} (id: ${r._id})`)
    .join(", ");

  return {
    success: true,
    data: simplified,
    total: result.total,
    summary:
      `User có ${result.total} món yêu thích: ${recipeList}. ` +
      `Dùng _id tương ứng khi cần add/remove_favorite_recipe.`,
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
