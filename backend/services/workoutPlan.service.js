const WorkoutPlan = require("../models/WorkoutPlan");

const workoutRecommendationService = require("./workoutRecommendation.service");  

// =====================================
// GET CURRENT PLAN
// =====================================

async function getCurrentPlan(userId) {
  const today = new Date();

  // tìm plan của tuần hiện tại
  let plan = await WorkoutPlan.findOne({
    userId,
    weekStartDate: { $lte: today },
    weekEndDate: { $gte: today },
  });

  // đã có => return
  if (plan) { return plan; }

  // tìm plan gần nhất
  const latestPlan =
    await WorkoutPlan.findOne({ userId })
      .sort({ currentWeek: -1 });

  // user mới hoàn toàn
  if (!latestPlan) {
    return await generateWeeklyPlan(userId, {
      currentWeek: 1,
    });
  }

  // đã có lịch sử => tạo tuần kế
  return await generateNextWeek(userId);
}

// =====================================
// GET TODAY WORKOUT
// =====================================

async function getTodayWorkout(userId) {
  let plan = await getCurrentPlan(userId);

  const today = new Date();

  const todayDay = today.getDay();

  // convert sunday
  const mappedDay = todayDay === 0 ? 7 : todayDay;

  let workoutDay = plan.days.find(
    (d) => d.day === mappedDay
  );

  // nếu plan lỗi hoặc thiếu
  if (!workoutDay) {
    plan = await generateWeeklyPlan(userId);

    workoutDay = plan.days.find(
      (d) => d.day === mappedDay
    );
  }

  return workoutDay;
}

// =====================================
// GENERATE WEEKLY PLAN
// =====================================

async function generateWeeklyPlan(
  userId,
  {
    currentWeek = 1,
    startDate = new Date(),
  } = {}
) {
  const generated =
    await workoutRecommendationService.generateAdaptiveWorkoutPlan(
      userId,
      {
        currentWeek,
        baseDate: startDate,
      }
    );

  const plan = await WorkoutPlan.create(
    {
      userId,

      currentWeek,

      workoutLevel: generated.workoutLevel,

      currentWeek: generated.currentWeek,

      weekStartDate: generated.weekStartDate,

      weekEndDate: generated.weekEndDate,

      weeklyTargetCalories: generated.weeklyTargetCalories,

      weeklyEstimatedCalories: generated.weeklyEstimatedCalories,

      recoveryScore: generated.recoveryScore,

      avgPerformanceScore: generated.avgPerformanceScore,

      readinessScore: generated.readinessScore,

      fatigueScore: generated.fatigueScore,

      targetCalories: generated.targetCalories,

      days: generated.days,

      generatedAt: new Date(),

      isActive: true,
    }
  );

  return plan;
}

// =====================================
// GET NEXT WEEK PLAN
// =====================================
async function getNextWeekPlan(userId) {

  const currentPlan =
    await WorkoutPlan.findOne({
      userId,
      isActive: true,
    });

  if (!currentPlan) {
    return null;
  }

  const nextWeek =
    currentPlan.currentWeek + 1;

  const nextPlan =
    await WorkoutPlan.findOne({
      userId,
      currentWeek: nextWeek,
    });

  return nextPlan;
}

// =====================================
// COMPLETE DAY
// =====================================

async function completeWorkoutDay(userId, day) {
  const plan = await WorkoutPlan.findOne({
    userId,
    isActive: true,
  });

  if (!plan) {
    throw new Error("Workout plan not found");
  }

  const targetDay = plan.days.find(
    (d) => d.day === day
  );

  if (!targetDay) {
    throw new Error("Day not found");
  }

  targetDay.completed = true;
  targetDay.completedAt = new Date();

  await plan.save();

  return plan;
}

// =====================================
// REGENERATE NEXT WEEK
// =====================================

async function generateNextWeek(userId) {
  const latestPlan =
    await WorkoutPlan.findOne({
      userId,
      isActive: true,
    }).sort({ currentWeek: -1 });

  let nextWeek = 1;

  if (latestPlan) {
    nextWeek =
      latestPlan.currentWeek + 1;

    // deactivate all active plans
    await WorkoutPlan.updateMany(
      {
        userId,
        isActive: true,
      },
      {
        isActive: false,
      }
    );
  }

  // week mới bắt đầu sau week cũ
  const nextStartDate =
    latestPlan
      ? new Date(
          latestPlan.weekEndDate.getTime()
          + 24 * 60 * 60 * 1000
        )
      : new Date();

  return await generateWeeklyPlan(
    userId,
    {
      currentWeek: nextWeek,
      startDate: nextStartDate,
    }
  );
}

async function skipWorkoutDay(userId, day) {
  const plan = await WorkoutPlan.findOne({
    userId,
    isActive: true,
  });

  if (!plan) {
    throw new Error("Workout plan not found");
  }

  const targetDay = plan.days.find(
    (d) => d.day === day
  );

  if (!targetDay) {
    throw new Error("Day not found");
  }

  targetDay.skipped = true;

  await plan.save();

  return plan;
}

async function getPlanStats(userId) {
  const plan = await WorkoutPlan.findOne({
    userId,
    isActive: true,
  }).lean();

  if (!plan) {
    return {
      completedDays: 0,
      skippedDays: 0,
      totalCalories: 0,
      completionRate: 0,
    };
  }

  const completedDays = plan.days.filter(
    (d) => d.completed
  ).length;

  const skippedDays = plan.days.filter(
    (d) => d.skipped
  ).length;

  const totalCalories = plan.days.reduce(
    (sum, d) => sum + (d.totalCalories || 0),
    0
  );

  const completionRate = Math.round(
    (completedDays / 7) * 100
  );

  return {
    currentWeek: plan.currentWeek,

    completedDays,

    skippedDays,

    totalCalories,

    completionRate,

    fatigueScore: plan.fatigueScore,

    recoveryScore: plan.recoveryScore,

    avgPerformanceScore: plan.avgPerformanceScore,

    readinessScore: plan.readinessScore,
  };
}

module.exports = {
  getCurrentPlan,
  getTodayWorkout,
  generateWeeklyPlan,
  getNextWeekPlan,
  completeWorkoutDay,
  generateNextWeek,
  getPlanStats,
  skipWorkoutDay,
};