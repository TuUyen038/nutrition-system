const User = require("../models/User");
const { createNutritionGoal } = require("../services/nutritionGoal.service");
const { logAction } = require("../middlewares/auditLog");
const bcrypt = require("bcryptjs");
const dailyMenuService = require("../services/dailyMenu.service");
const DailyMenu = require("../models/DailyMenu");
const NutritionGoal = require("../models/NutritionGoal");
const { normalizeDate } = require("../utils/date");

/**
 * Lấy danh sách tất cả người dùng (CHỈ ADMIN)
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select(
      "-password -resetPasswordToken -resetPasswordExpires",
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Lấy thông tin user hiện tại (đã đăng nhập)
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -resetPasswordToken -resetPasswordExpires",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Lấy thông tin 1 user theo ID
 * - ADMIN: có thể xem bất kỳ user nào
 * - USER: chỉ có thể xem thông tin của chính mình
 */
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    // USER chỉ có thể xem thông tin của chính mình
    if (req.user.role !== "ADMIN" && userId !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Bạn chỉ có thể xem thông tin của chính mình",
      });
    }

    const user = await User.findById(userId).select(
      "-password -resetPasswordToken -resetPasswordExpires",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Cập nhật thông tin người dùng
 * - ADMIN: có thể cập nhật bất kỳ user nào
 * - USER: chỉ có thể cập nhật thông tin của chính mình
 * - Không cho phép đổi password ở đây (dùng changePassword)
 * - Không cho phép đổi email
 */
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (req.user.role !== "ADMIN" && userId !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Bạn chỉ có thể cập nhật thông tin của chính mình",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldData = user.toObject();
    delete oldData.password;
    delete oldData.resetPasswordToken;
    delete oldData.resetPasswordExpires;

    if (req.body.password) {
      return res.status(400).json({
        message: "Không thể đổi mật khẩu ở đây.",
      });
    }

    if (req.body.email && req.body.email !== user.email) {
      return res.status(400).json({
        message: "Không thể đổi email",
      });
    }

    if (req.body.role) {
      return res.status(400).json({
        message: "Không thể thay đổi role tại đây",
      });
    }

    const { password, email, role, reason, ...updateData } = req.body;

    const isAdminEditingOtherUser =
      req.user.role === "ADMIN" &&
      userId !== req.user._id.toString();

    if (isAdminEditingOtherUser && !reason) {
      return res.status(400).json({
        message: "Vui lòng cung cấp lý do khi chỉnh sửa thông tin user",
      });
    }

    // Detect body changes BEFORE save
    const bodyFields = ["age", "gender", "height", "weight", "goal", "fitnessLevel"];

    const bodyChanged = bodyFields.some(
      (field) =>
        updateData[field] !== undefined &&
        updateData[field] !== user[field]
    );

    Object.assign(user, updateData);
    await user.save();

    // Only create new goal if body actually changed
    if (bodyChanged) {
      await createNutritionGoal(user);
    }

    const newData = user.toObject();
    delete newData.password;
    delete newData.resetPasswordToken;
    delete newData.resetPasswordExpires;

    await logAction(
      req,
      "UPDATE",
      "User",
      userId,
      oldData,
      newData,
      reason ||
        (isAdminEditingOtherUser
          ? "Admin updated user information"
          : "User updated profile")
    );

    res.json({
      message: "Cập nhật thông tin thành công",
      user: newData,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
/**
 * Xóa người dùng (CHỈ ADMIN)
 */
// controllers/user.controller.js
exports.deleteUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const adminId = req.user._id; // Lấy từ token đã verify
    const { reason } = req.body;

    // 1. Kiểm tra lý do
    if (!reason || reason.trim().length < 5) {
      return res
        .status(400)
        .json({ message: "Lý do xóa phải ít nhất 5 ký tự." });
    }

    // 2. Chặn tự xóa chính mình
    if (targetUserId === adminId.toString()) {
      return res
        .status(400)
        .json({ message: "Bạn không thể tự xóa tài khoản của mình." });
    }

    // 3. Tìm user mục tiêu (chưa bị xóa)
    const user = await User.findOne({ _id: targetUserId, deletedAt: null });
    if (!user) {
      return res
        .status(404)
        .json({ message: "Người dùng không tồn tại hoặc đã bị xóa." });
    }

    // 4. Kiểm tra cấp bậc (Phân quyền nâng cao - Tùy chọn)
    // Ví dụ: ADMIN thường không thể xóa một SUPER_ADMIN khác
    if (user.role === "ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xóa một Admin khác." });
    }

    // 5. Thực hiện Soft Delete
    const oldData = user.toObject();
    delete oldData.password;

    user.deletedAt = new Date();
    user.deletedBy = adminId;
    user.deletionReason = reason;

    await user.save();

    // 6. Ghi Audit Log
    await logAction(
      req,
      "DELETE",
      "User",
      targetUserId,
      oldData,
      { status: "DELETED", reason },
      reason,
    );

    res
      .status(200)
      .json({ message: "Người dùng đã được chuyển vào trạng thái lưu trữ." });
  } catch (err) {
    res.status(500).json({ message: "Lỗi Server: " + err.message });
  }
};
/**
 * Lấy thống kê dashboard cho user
 * - Donut chart: % Calo, Protein, Chất béo, Tinh bột từ menu hôm nay (chỉ tính status="eaten")
 * - Line chart: Calo tiêu thụ và mục tiêu cho 7 ngày gần nhất
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // 1. Lấy daily target (mục tiêu dinh dưỡng hàng ngày)
    const goal = await NutritionGoal.findOne({ userId, status: "active" })
      .sort({ createNutritionGoaldAt: -1 })
      .lean();
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
      };
    } else {
      // Fallback nếu chưa set NutritionGoal
      const baseCalories = 2000;
      dailyTarget = {
        calories: baseCalories,
        protein: (baseCalories * 0.2) / 4,
        fat: (baseCalories * 0.3) / 9,
        carbs: (baseCalories * 0.5) / 4,
      };
    }

    // 2. Lấy menu hôm nay (donut chart)
    const today = new Date();
    const todayStr = normalizeDate(today);

    const todayMenus = await DailyMenu.find({
      userId,
      date: todayStr,
    })
      .populate({
        path: "recipes.recipeId",
        model: "Recipe",
        match: { deleted: { $ne: true } },
        select: "totalNutrition",
      })
      .lean();

    // Tính consumed nutrition từ menu hôm nay (chỉ tính status="eaten")
    let consumedToday = {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    };

    todayMenus.forEach((menu) => {
      if (menu.recipes && Array.isArray(menu.recipes)) {
        menu.recipes.forEach((recipe) => {
          if (
            recipe.status === "eaten" &&
            recipe.recipeId &&
            recipe.recipeId.totalNutrition
          ) {
            const portion = recipe.portion || 1;
            const nutrition = recipe.recipeId.totalNutrition;
            consumedToday.calories += (nutrition.calories || 0) * portion;
            consumedToday.protein += (nutrition.protein || 0) * portion;
            consumedToday.fat += (nutrition.fat || 0) * portion;
            consumedToday.carbs += (nutrition.carbs || 0) * portion;
          }
        });
      }
    });

    // Tính % cho donut chart (dựa trên calories)
    const totalCalories = consumedToday.calories || 0;
    const proteinCalories = (consumedToday.protein || 0) * 4; // 1g protein = 4 kcal
    const fatCalories = (consumedToday.fat || 0) * 9; // 1g fat = 9 kcal
    const carbsCalories = (consumedToday.carbs || 0) * 4; // 1g carbs = 4 kcal

    // Donut chart data: % của tổng calories (chỉ tính protein, fat, carbs)
    // Nếu không có calories, hiển thị 0
    const donutChartData = {
      labels: ["Calo", "Protein", "Chất béo", "Tinh bột"],
      datasets: {
        label: "Phần trăm (%)",
        data: [
          Math.round(totalCalories), // Tổng calories (không phải %)
          totalCalories > 0
            ? Math.round((proteinCalories / totalCalories) * 100)
            : 0,
          totalCalories > 0
            ? Math.round((fatCalories / totalCalories) * 100)
            : 0,
          totalCalories > 0
            ? Math.round((carbsCalories / totalCalories) * 100)
            : 0,
        ],
      },
      cutout: "60%",
    };

    // 3. Lấy menu 7 ngày gần nhất (line chart)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6); // 7 ngày (bao gồm hôm nay)
    const startDateStr = normalizeDate(sevenDaysAgo);

    const weeklyMenus = await DailyMenu.find({
      userId,
      date: { $gte: startDateStr, $lte: todayStr },
    })
      .populate({
        path: "recipes.recipeId",
        model: "Recipe",
        match: { deleted: { $ne: true } },
        select: "totalNutrition",
      })
      .lean();

    // Tạo map để tính consumed calories cho từng ngày
    const consumedByDate = {};
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = normalizeDate(date);
      dates.push(dateStr);
      consumedByDate[dateStr] = 0;
    }

    // Tính consumed calories cho từng ngày (chỉ tính status="eaten")
    weeklyMenus.forEach((menu) => {
      if (menu.recipes && Array.isArray(menu.recipes)) {
        let dayCalories = 0;
        menu.recipes.forEach((recipe) => {
          if (
            recipe.status === "eaten" &&
            recipe.recipeId &&
            recipe.recipeId.totalNutrition
          ) {
            const portion = recipe.portion || 1;
            dayCalories +=
              (recipe.recipeId.totalNutrition.calories || 0) * portion;
          }
        });
        consumedByDate[menu.date] = Math.round(dayCalories);
      }
    });

    // Tạo labels và data cho line chart
    const lineChartLabels = dates.map((dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    });

    const consumedData = dates.map((dateStr) => consumedByDate[dateStr] || 0);
    const targetData = dates.map(() => Math.round(dailyTarget.calories));

    const lineChartData = {
      labels: lineChartLabels,
      datasets: [
        {
          label: "Calo đã tiêu thụ (kcal)",
          data: consumedData,
          borderColor: "#E53935",
          backgroundColor: "rgba(229, 57, 53, 0.1)",
          tension: 0.4,
          fill: true,
        },
        {
          label: "Calo mục tiêu (kcal)",
          data: targetData,
          borderColor: "#1A73E8",
          backgroundColor: "rgba(26, 115, 232, 0.1)",
          borderDash: [10, 5],
          tension: 0.4,
          fill: false,
        },
      ],
    };

    res.json({
      donutChart: donutChartData,
      lineChart: lineChartData,
    });
  } catch (error) {
    console.error("Get user dashboard stats error:", error);
    res.status(500).json({ message: error.message });
  }
};
