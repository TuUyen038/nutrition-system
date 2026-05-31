const DailyMenu = require("../models/DailyMenu");
const MealPlan = require("../models/MealPlan");
const { calculateTotalNutrition } = require("../utils/calTotalNutri");
const mongoose = require("mongoose");
const { normalizeDate } = require("../utils/date");
const User = require("../models/User");
const NutritionGoal = require("../models/NutritionGoal");
const Recipe = require("../models/Recipe");
const { createMealLog, deleteMealLog } = require("./mealLog.service");

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

  if (dailyMenu.status === "deleted" || dailyMenu.status === "expired") {
    throw new Error(
      `Không thể cập nhật DailyMenu đang ở trạng thái "${dailyMenu.status}".`,
    );
  }
//TODO: khi gọi create suggest, nhớ check trong db hiện tại có cái dailymenu nào đang được selected chưa. Có rồi thì phải thông báo là có dailymenu r nên k tạo suggest nữa
  // Khi user chọn 1 dailyMenu -> expire các dispatch suggested khác bị trùng thời gian
  if (newStatus === "selected") {
    await DailyMenu.updateMany(
      {
        userId,
        _id: { $ne: dailyMenuId },
        status: { $in: ["suggested", "selected", "manual"] },
        date: dailyMenu.date,
      },
      { $set: { status: "expired" } },
    );
  }

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
if (dailyMenu.status === "deleted" || dailyMenu.status === "expired") {
    throw new Error(
      `Thực đơn không còn hoạt động`,
    );
  }

  // 2. Lấy thông tin dinh dưỡng gốc của Recipe
  const recipeData = await Recipe.findById(recipeId)
    .select("name imageUrl description totalNutritionPerServing mealSources")
    .lean();
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

  if (dailyMenu.status === "deleted" || dailyMenu.status === "expired") {
    throw new Error(
      `Thực đơn không còn hoạt động`,
    );
  }

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
      console.log("Tạo MealLog");
      await createMealLog(userId, targetRecipe, dailyMenu.date, dailyMenu._id);
    } else {
      console.log("Xóa MealLog");
      await deleteMealLog(userId, targetRecipe.recipeId, dailyMenu.date, dailyMenu._id);
    }
  }

  // 5. Lưu lại
  return await dailyMenu.save();
};
exports.deleteRecipeInMenu = async ({ userId, dailyMenuId, recipeItemId }) => {
  // 1. Tìm menu
  const dailyMenu = await DailyMenu.findOne({ _id: dailyMenuId, userId });
  if (!dailyMenu) throw new Error("Không tìm thấy thực đơn ngày này!");

  if (dailyMenu.status === "deleted" || dailyMenu.status === "expired") {
    throw new Error(
      `Thực đơn không còn hoạt động`,
    );
  }
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
  
  console.log("Xóa MealLog vì xoá món ăn");
  await deleteMealLog(userId, targetRecipe.recipeId, dailyMenu.date, dailyMenu._id);


  return await dailyMenu.save();
};

exports.getDailyMenuByDate = async ({ userId, date }) => {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  return await DailyMenu.findOne({
    userId,
    date: {
      $gte: start,
      $lte: end,
    },
    status: { $in: ["manual", "selected", "suggested"] },
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
    status: { $in: ["manual", "selected"] },
  })
    .lean()
    .sort({ date: 1 });
};

//TODO: neu ham nay sua nay van k dung thi co the xoa
// exports.createDailyMenu = async (data) => {
//   try {
//     let { userId, date, recipes, status } = data;

//     if (!userId || !date) {
//       throw new Error("Thiếu userId hoặc date.");
//     }
//     // Normalize date TRƯỚC KHI tìm existing để đảm bảo match đúng
//     date = normalizeDate(date);

//     let deletedMenu = await DailyMenu.find({
//     userId,
//     date: {
//       $gte: date,
//       $lte: date,
//     },
//     status: { $in: ["deleted", "expired"] },
//   })
//     .lean()

//     // Tìm existing menu - nếu có nhiều, lấy cái mới nhất (tránh trùng rác cũ)
//     let existing = await DailyMenu.findOne({ userId, date }).sort({
//       createdAt: -1,
//     });

//     const normalizedRecipes = await Promise.all(
//       (recipes || []).map(async (r) => {
//         const recipeItem = {
//           recipeId: r.recipeId,
//           scale: r.scale || 1,
//           status: r.status || "suggested",
//           servingTime: r.servingTime || "other",
//         };
//         return recipeItem;
//       }),
//     );

//     const totalNutrition = await calculateTotalNutrition(normalizedRecipes);

//     if (!existing) {
//       // Tạo mới
//       const created = await DailyMenu.create({
//         userId,
//         date,
//         recipes: normalizedRecipes,
//         totalNutrition,
//         status: status || "suggested",
//       });

//       //  Populate recipes.recipeId để trả về đầy đủ thông tin
//       await created.populate({
//         path: "recipes.recipeId",
//         model: "Recipe",
//         match: { deleted: { $ne: true } },
//         select: "name description imageUrl totalNutrition",
//       });
//       // Filter out recipes that failed to populate (i.e., deleted)
//       created.recipes = created.recipes.filter((r) => r.recipeId);

//       return { type: "created", data: created };
//     }
//     existing.recipes = normalizedRecipes;
//     existing.totalNutrition = totalNutrition;
//     if (status) existing.status = status;

//     await existing.save();

//     //  Populate recipes.recipeId để trả về đầy đủ thông tin
//     await existing.populate({
//       path: "recipes.recipeId",
//       model: "Recipe",
//       match: { deleted: { $ne: true } },
//       select: "name description imageUrl totalNutrition",
//     });
//     // Filter out recipes that failed to populate (i.e., deleted)
//     existing.recipes = existing.recipes.filter((r) => r.recipeId);

//     return { type: "updated", data: existing };
//   } catch (error) {
//     console.error("Lỗi upsert DailyMenu:", error);
//     throw new Error("Không thể lưu thực đơn: " + error.message);
//   }
// };

exports.getDailyMenusByDateAndStatus = async ({ userId, date, statuses }) => {
  const start = new Date(date + "T00:00:00+07:00");
  const end = new Date(date + "T23:59:59+07:00");
 
  return DailyMenu.find({
    userId,
    date: { $gte: start, $lte: end },
    status: { $in: statuses },
  })
    .lean()
    .sort({ createdAt: -1 }); // mới nhất lên đầu
};
