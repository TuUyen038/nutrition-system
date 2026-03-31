const Recipe = require("../models/Recipe");
const { searchByName } = require("../utils/search");
const Ingredient = require("../models/Ingredient");

const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
exports.searchRecipesByIngredientName = async (keyword, options = {}) => {
  const page = Number(options.page) > 0 ? Number(options.page) : 1;
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 10;
  const skip = (page - 1) * limit;

  if (!keyword || !keyword.trim()) {
    return {
      recipes: [],
      total: 0,
      page,
      limit,
    };
  }

  const cleanKeyword = keyword.trim();
  const regex = new RegExp(escapeRegex(cleanKeyword), "i");

  // pipeline aggregate để:
  // - match theo name hoặc ingredients.name
  // - thêm cờ matchByName, matchByIngredient
  // - có thể lấy luôn danh sách ingredient match
  const baseMatch = {
    $or: [
      { name: regex },
      { "ingredients.name": regex },
    ],
    deleted: { $ne: true },
  };

  const pipeline = [
    { $match: baseMatch },

    // đánh dấu match theo tên món
    {
      $addFields: {
        matchByName: { $regexMatch: { input: "$name", regex } },
      },
    },
    // lọc ra các ingredients match
    {
      $addFields: {
        matchedIngredients: {
          $filter: {
            input: "$ingredients",
            as: "ing",
            cond: {
              $regexMatch: {
                input: "$$ing.name",
                regex,
              },
            },
          },
        },
      },
    },

    // flag xem có match theo ingredient không
    {
      $addFields: {
        matchByIngredient: {
          $gt: [{ $size: "$matchedIngredients" }, 0],
        },
      },
    },

    // sort mới nhất trước
    { $sort: { createdAt: -1 } },

    // phân trang
    { $skip: skip },
    { $limit: limit },

    // chọn field cần thiết
    {
      $project: {
        name: 1,
        description: 1,
        category: 1,
        imageUrl: 1,
        totalNutrition: 1,
        ingredients: 1,
        matchByName: 1,
        matchByIngredient: 1,
        // nếu không muốn gửi full matchedIngredients ra thì có thể chỉ gửi tên:
        matchedIngredientNames: "$matchedIngredients.name",
      },
    },
  ];

  const [items, totalArr] = await Promise.all([
    Recipe.aggregate(pipeline),
    Recipe.countDocuments(baseMatch),
  ]);

  return {
    recipes: items,
    total: totalArr,
    page,
    limit,
  };

};

exports.searchRecipes = async (name) => {
  return await searchByName(Recipe, name);
};

exports.getRecipeById = async (id) => {
  return await Recipe.findOne({
    _id: id,
    deleted: { $ne: true },
  });
};

exports.createRecipe = async (recipe) => {
  return await Recipe.create(recipe);
};
exports.saveRecipeToDB = async (recipeData) => {
  try {
    // ✅ Ensure ingredients có originalAmount/originalUnit (fallback to amount/unit)
    const normalized = {
      ...recipeData,
      verified: recipeData.verified ?? false,
      
    };

    if (Array.isArray(normalized.ingredients)) {
      normalized.ingredients = normalized.ingredients.map((ing) => ({
        ...ing,
        quantity: {
          ...ing.quantity,
          // ✅ Fallback to amount/unit nếu originalAmount/originalUnit không có
          originalAmount: ing.quantity?.originalAmount ?? ing.quantity?.amount ?? "",
          originalUnit: ing.quantity?.originalUnit ?? ing.quantity?.unit ?? "g",
        },
      }));
    }

    const newRecipe = new Recipe(normalized);
    const savedRecipe = await newRecipe.save();
    console.log(`Đã lưu công thức: ${savedRecipe.name}`);
    return savedRecipe;
  } catch (error) {
    throw new Error(
      "Lỗi khi lưu công thức vào cơ sở dữ liệu: " + error.message
    );
  }
};
//danh sach mon an
exports.getVerifiedRecipes = async () => {
  try {
    const recipes = await Recipe.find(
      { verified: true, deleted: { $ne: true } },
      { name: 1, "totalNutrition.calories": 1, imageUrl: 1, public_id: 1 } // projection
    );
    return recipes;
  } catch (error) {
    throw new Error(
      "Lỗi khi lấy danh sách công thức đã xác minh: " + error.message
    );
  }
};

// Hybrid Image→Text→Search
// Tìm kiếm recipes dựa trên tên món ăn đã được detect từ ảnh
exports.searchRecipesByImage = async (foodName, options = {}) => {
  // Sử dụng lại function searchRecipesByIngredientName đã có
  // vì nó tìm trong name và ingredients.name, phù hợp cho tên món ăn
  return await exports.searchRecipesByIngredientName(foodName, options);
};
