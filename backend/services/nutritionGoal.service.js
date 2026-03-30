const mongoose = require("mongoose");
const NutritionGoal = require("../models/NutritionGoal");
const { fitnessToActivityFactor } = require("../utils/fitnessMapping");

const DEFAULT_ACTIVITY_FACTOR = 1.55; // moderate

// ========================
// BMR (Mifflin-St Jeor)
// ========================
function calculateBMR({ gender, age, height, weight }) {
  if (!gender || !age || !height || !weight) return 0;

  return gender === "male"
    ? 9.99 * weight + 6.25 * height - 4.92 * age + 5
    : 9.99 * weight + 6.25 * height - 4.92 * age - 161;
}

// ========================
// TDEE = BMR ×  activityFactor (ưu tiên fitness level nếu có)
// ========================
function calculateTDEE(user) {
  const bmr = calculateBMR(user);
  if (!bmr) return 0;

  let activityFactor = DEFAULT_ACTIVITY_FACTOR;

  // Ưu tiên fitnessLevel
  if (user.fitnessLevel && fitnessToActivityFactor[user.fitnessLevel]) {
    activityFactor = fitnessToActivityFactor[user.fitnessLevel];
  }

  return bmr * activityFactor;
}

// ========================
// Adjust by Goal
// ========================
function adjustByGoal(calories, goal) {
  switch (goal) {
    case "lose_weight":
      return calories - 300;
    case "gain_weight":
      return calories + 300;
    default:
      return calories;
  }
}

// ========================
// Calculate Nutrition Target
// ========================
function calculateNutritionGoal(user) {
  const tdee = calculateTDEE(user);
  if (!tdee) return null;

  const calories = Math.round(adjustByGoal(tdee, user.goal));

  return {
    calories, // kcal
    protein: Math.round((calories * 0.3) / 4),  // g
    fat: Math.round((calories * 0.25) / 9),     // g
    carbs: Math.round((calories * 0.45) / 4),   // g
    fiber: 25,                                  // g
    sugar: 50,                                  // g
    sodium: 2300,                               // mg
  };
}


async function createNutritionGoal(user) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const targetNutrition = calculateNutritionGoal(user);

    if (!targetNutrition) {
      throw new Error("Cannot calculate nutrition goal");
    }

    // Archive goal active cũ
    await NutritionGoal.updateMany(
      { userId: user._id, status: "active" },
      { status: "archived" },
      { session }
    );

    // derive activityFactor từ fitnessLevel (giống TDEE)
    let activityFactor = DEFAULT_ACTIVITY_FACTOR;

    if (user.fitnessLevel && fitnessToActivityFactor[user.fitnessLevel]) {
      activityFactor = fitnessToActivityFactor[user.fitnessLevel];
    }

    // Create goal mới
    const [newGoal] = await NutritionGoal.create(
      [
        {
          userId: user._id,
          bodySnapshot: {
            age: user.age,
            gender: user.gender,
            height: user.height,
            weight: user.weight,
            goal: user.goal,
            activityFactor,
            fitnessLevel: user.fitnessLevel || "sedentary", // ít hoạt động nếu không có thông tin fitnessLevel, để dễ theo dõi lịch sử thay đổi
          },
          targetNutrition,
          status: "active",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return newGoal;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}
async function getActiveGoal(req, res) {
  const goal = await NutritionGoal.findOne({
    userId: req.user._id,
    status: "active",
  });

  if (!goal) {
    return res.status(404).json({ message: "No active goal found" });
  }

  res.json(goal);
};

module.exports = {
  createNutritionGoal,
  getActiveGoal,
  calculateBMR,
  calculateTDEE
};
