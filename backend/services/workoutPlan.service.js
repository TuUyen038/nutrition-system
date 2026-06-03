const WorkoutPlan = require("../models/WorkoutPlan");

const workoutRecommendationService = require("./workoutRecommendation.service");  

// =====================================
// GET CURRENT PLAN
// =====================================

async function getCurrentPlan(userId) {
  let plan = await WorkoutPlan.findOne({
    userId,
    isActive: true,
  });

  if (!plan) {
    plan = await generateWeeklyPlan(userId);
  }

  return plan;
}

// =====================================
// GENERATE WEEKLY PLAN
// =====================================

async function generateWeeklyPlan(userId) {
  const generated =
    await workoutRecommendationService.generateAdaptiveWorkoutPlan(
      userId
    );

  const plan = await WorkoutPlan.findOneAndUpdate(
    {
      userId,
    },
    {
      userId,

      workoutLevel: generated.workoutLevel,

      currentWeek: generated.currentWeek,

      weekStartDate: generated.weekStartDate,

      weekEndDate: generated.weekEndDate,

      recoveryScore: generated.recoveryScore,

      avgPerformanceScore: generated.avgPerformanceScore,

      readinessScore: generated.readinessScore,

      fatigueScore: generated.fatigueScore,

      targetCalories: generated.targetCalories,

      days: generated.days,

      generatedAt: new Date(),

      isActive: true,
    },
    {
      new: true,
      upsert: true,
    }
  );

  return plan;
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
  const current = await WorkoutPlan.findOne({
    userId,
    isActive: true,
  });

  if (current) {
    current.currentWeek += 1;
    await current.save();
  }

  return await generateWeeklyPlan(userId);
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
  generateWeeklyPlan,
  completeWorkoutDay,
  generateNextWeek,
  getPlanStats,
  skipWorkoutDay,
};