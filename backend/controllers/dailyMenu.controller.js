const dailyMenuService = require("../services/dailyMenu.service");
const DailyMenu = require("../models/DailyMenu");
const {
    recommendDayPlan,
    recommendWeekPlan,
} = require("../services/mealRecommendation.service");

exports.suggestDailyMenuV2 = async (req, res) => {
  try {
        const userId = req.user._id; // từ auth middleware
        const { date, saveToDB = false } = req.body;

        const result = await recommendDayPlan(userId, {
            date:     date ? new Date(date) : new Date(),
            saveToDB: Boolean(saveToDB),
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error("[recommendDay] Error:", err);
        return res.status(400).json({
            success: false,
            message: err.message || "Internal server error",
        });
    }
};
exports.addRecipe = async (req, res) => {
  try {
    const data = {
      userId: req.user._id,
      ...req.validatedData 
    };

    const updatedMenu = await dailyMenuService.addRecipeToMenu(data);

    return res.status(200).json({
      success: true,
      message: "Đã thêm món ăn vào thực đơn",
      data: updatedMenu
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
exports.updateRecipe = async (req, res) => {
  try {
    const data = {
      userId: req.user._id,
      ...req.validatedData, // Chứa: date, recipeId, servingTime, newScale, checked
    };

    const updatedMenu = await dailyMenuService.updateRecipeInMenu(data);

    return res.status(200).json({
      success: true,
      message: "Cập nhật thực đơn thành công",
      data: updatedMenu
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
exports.deleteRecipe = async (req, res) => {
  try {
    const data = {
      userId: req.user._id,
      ...req.validatedData // Chứa: date, recipeId
    };

    const updatedMenu = await dailyMenuService.deleteRecipeInMenu(data);

    return res.status(200).json({
      success: true,
      message: "Đã xoá món ăn khỏi thực đơn",
      data: updatedMenu
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
exports.updateStatus = async (req, res) => {
  try {
    const data = {
      userId: req.user._id,
      ...req.validatedData 
    };

    const dailyMenu = await dailyMenuService.updateDailyMenuStatus(data);
    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái của thực đơn",
      data: dailyMenu
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};





// Thêm vào dailyMenu.controller.js
exports.suggestRecipesForMeal = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      date,
      mealType, // "breakfast", "lunch", "dinner"
      allowedCategories = [], // optional: ["main", "side"]
      topN = 3,
    } = req.body;

    const user = await User.findById(userId).lean();
    const goal = await NutritionGoal.findOne({ userId, status: "active" })
      .sort({ createdAt: -1 })
      .lean();

    if (!goal) {
      return res.status(400).json({ message: "Chưa set nutrition goal" });
    }

    // Lấy nutrition đã gọi trong ngày (nếu có)
    const existing = await DailyMenu.findOne({ userId, date }).lean();

    const currentDayNutrition = existing?.totalNutrition || {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
    };

    // Gợi ý top N recipes
    const recipes = await mealRecommendationService.pickTopRecipesForMeal({
      userId,
      dateStr: date,
      mealType,
      currentDayNutrition,
      dailyTarget: goal.targetNutrition,
      user,
      allowedCategories,
      topN,
    });

    return res.status(200).json({
      mealType,
      suggestions: recipes.map((r) => ({
        _id: r._id,
        name: r.name,
        category: r.category,
        imageUrl: r.imageUrl,
        totalNutrition: r.totalNutrition,
        _score: r._score, // similarity score
      })),
    });
  } catch (err) {
    console.error("Error suggestRecipesForMeal:", err);
    return res.status(500).json({ message: err.message });
  }
};
// exports.suggestDailyMenu = async (req, res) => {
//   try {
//     const userId = req.user._id; // Lấy từ authenticated user
//     const { date } = req.body;

//     if (!date) {
//       return res.status(400).json({ message: "date là bắt buộc" });
//     }

//     const dailyMenu = await dailyMenuService.suggestDailyMenu({
//       userId,
//       dateStr: date,
//     });
//     await dailyMenu.populate({
//       path: "recipes.recipeId",
//       model: "Recipe",
//     });
//     return res.status(201).json(dailyMenu);
//   } catch (err) {
//     console.error("Error suggestDailyMenu:", err);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };


// exports.getDailyMenuById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const detail = await dailyMenuService.getMealDetail(userId, id);
//     res.status(200).json(detail);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error retrieving meal detail" });
//   }
// };
// exports.getAllDailyMenu = async (req, res) => {
//   try {
//     const detail = await dailyMenuService.getAllMeal(userId);
//     res.status(200).json(detail);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error retrieving meal detail" });
//   }
// };

// exports.getRecipesByDateAndStatus = async (req, res) => {
//   try {
//     const userId = req.user._id.toString();

//     const { startDate, endDate, status } = req.query;

//     const data = await dailyMenuService.getRecipesByDateAndStatus({
//       userId,
//       startDate,
//       endDate,
//       status,
//     });
//     res.status(200).json(data);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };
