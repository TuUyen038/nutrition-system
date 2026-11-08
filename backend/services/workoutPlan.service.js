const WorkoutPlan = require("../models/WorkoutPlan");
const WorkoutSession = require("../models/WorkoutSession");

const workoutRecommendationService = require("./workoutRecommendation.service");
const adaptivePlanService = require("./adaptivePlan.service");

function getVNDateOnly(date = new Date()) {
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function toUTCDateOnly(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 00:00 (Vietnam time) of the day that contains `date`. Week bounds are
 * whole VN days: before, weekStartDate kept the hour the plan was made,
 * so on day 7 after that hour no plan covered "now" and a new week was
 * generated on every request.
 */
function startOfVNDay(date = new Date()) {
  return new Date(`${getVNDateOnly(new Date(date))}T00:00:00+07:00`);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPastOrTodayDateVN(date) {
  const inputDate = getVNDateOnly(new Date(date));
  const todayDate = getVNDateOnly(new Date());

  return toUTCDateOnly(inputDate) <= toUTCDateOnly(todayDate);
}

// Auto complete rest days
async function autoCompleteRestDays(plan) {
  if (!plan?.days?.length) return plan;

  let hasChanged = false;

  plan.days.forEach((day) => {
    if (
      day.type === "rest" &&
      isPastOrTodayDateVN(day.date) &&
      !day.completed
    ) {
      day.completed = true;
      day.skipped = false;
      day.completedAt = new Date();
      hasChanged = true;
    }
  });

  if (hasChanged) {
    await plan.save();
  }

  return plan;
}

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

  // đã có => return + auto complete rest days
  if (plan) {
    return await autoCompleteRestDays(plan);
  }

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
  
  if (!plan?.weekStartDate) return null;

  // Step 6: re-check the user's state once a day and adapt the days
  // that have not happened yet, then read the plan again.
  const adapted = await adaptivePlanService.adaptPlanIfDue(userId);

  if (adapted) {
    plan = (await WorkoutPlan.findById(plan._id)) || plan;
  }

  const startDateOnly = getVNDateOnly(new Date(plan.weekStartDate));
  const todayDateOnly = getVNDateOnly(new Date());

  // tính số ngày lệch
  const diffDays = Math.floor(
    (toUTCDateOnly(todayDateOnly) - toUTCDateOnly(startDateOnly)) /
      (1000 * 60 * 60 * 24)
  );

  // plan.days là 1–7
  const mappedDay = diffDays + 1;

  if (mappedDay < 1 || mappedDay > 7) {
    return null;
  }

  let workoutDay = plan.days.find(
    (d) => d.day === mappedDay
  );

  // nếu plan lỗi hoặc thiếu → generate
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
        baseDate: startOfVNDay(startDate),
      }
    );

  // Day 1 00:00 -> day 7 23:59:59.999 (VN).
  generated.weekStartDate = startOfVNDay(startDate);
  generated.weekEndDate = new Date(generated.weekStartDate.getTime() + 7 * DAY_MS - 1);

  const now = new Date();
  const { restDecision } = generated;

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

      generatedAt: now,

      isActive: true,

      adaptations: restDecision?.days?.length
        ? [
            {
              at: now,
              source: "generation",
              action: "rest",
              reasons: restDecision.reasons,
              recoveryScore: generated.recoveryScore,
              fatigueScore: generated.fatigueScore,
              readinessScore: generated.readinessScore,
              days: restDecision.days,
            },
          ]
        : [],
    }
  );

  // The plan above is the "base" week (level + goal). Apply the user's
  // state to it once, here, with the step 6 rules; every later
  // adaptation is computed from the same base, so nothing stacks.
  // Never fails generation: worst case the base plan is returned and
  // /today adapts it later.
  try {
    const adapted = await adaptivePlanService.adaptPlan(userId, {
      planId: plan._id,
      now,
    });

    return adapted.plan;
  } catch (error) {
    console.error("[WorkoutPlan] adapt after generate:", error.message || error);

    return plan;
  }
}

// =====================================
// (RE)GENERATE THE CURRENT WEEK
// =====================================

/**
 * POST /generate. Before, it always created week 1, which fails on the
 * unique (userId, currentWeek) index for anyone who already has a plan.
 *
 * - no plan for this week -> same as getCurrentPlan (create it)
 * - plan exists, force=false -> return it unchanged
 * - plan exists, force=true -> rebuild it (e.g. after changing goal,
 *   level or equipment), only if no exercise of it was started yet
 */
async function regenerateCurrentWeek(userId, { force = false } = {}) {
  const today = new Date();

  const current = await WorkoutPlan.findOne({
    userId,
    weekStartDate: { $lte: today },
    weekEndDate: { $gte: today },
  });

  if (!current) {
    return { plan: await getCurrentPlan(userId), regenerated: true };
  }

  if (!force) {
    return { plan: current, regenerated: false };
  }

  const started = await WorkoutSession.exists({ userId, planId: current._id });

  if (started) {
    throw httpError(409, "Tuần này đã có bài tập được bắt đầu, không tạo lại được");
  }

  const { currentWeek, weekStartDate } = current;

  // (userId, currentWeek) is unique, so the old plan must go first.
  // If generation fails, put it back instead of leaving the week empty.
  const backup = current.toObject();

  await WorkoutPlan.deleteOne({ _id: current._id });

  try {
    const plan = await generateWeeklyPlan(userId, {
      currentWeek,
      startDate: weekStartDate,
    });

    return { plan, regenerated: true };
  } catch (error) {
    await WorkoutPlan.collection.insertOne(backup);
    throw error;
  }
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
  // Highest week number, active or not: (userId, currentWeek) is unique.
  const latestPlan =
    await WorkoutPlan.findOne({ userId }).sort({ currentWeek: -1 });

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
  // Day after the previous week, but never in the past: a user back
  // after 3 weeks away gets a plan starting today, not 3 weeks ago.
  const today = startOfVNDay(new Date());
  const afterPrevious = latestPlan
    ? startOfVNDay(new Date(latestPlan.weekEndDate.getTime() + 1))
    : today;

  const nextStartDate = afterPrevious > today ? afterPrevious : today;

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

  if (targetDay.type !== "workout") {
    throw new Error("Ngày nghỉ không cần bỏ qua");
  }

  if (targetDay.completed) {
    throw new Error("Ngày này đã hoàn thành");
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

  // Only workout days count: rest days are auto-completed, so counting
  // them made a week with no training look 40-60% complete.
  const workoutDays = plan.days.filter((d) => d.type === "workout");

  const completedDays = workoutDays.filter(
    (d) => d.completed
  ).length;

  const skippedDays = workoutDays.filter(
    (d) => d.skipped
  ).length;

  // days[].totalCalories does not exist (always 0 before): use the
  // calories actually burned in this plan's sessions.
  const sessions = await WorkoutSession.find({
    userId,
    planId: plan._id,
    completed: true,
  })
    .select("actualCalories")
    .lean();

  const totalCalories = Math.round(
    sessions.reduce((sum, s) => sum + (s.actualCalories || 0), 0)
  );

  const completionRate = workoutDays.length
    ? Math.round((completedDays / workoutDays.length) * 100)
    : 0;

  return {
    currentWeek: plan.currentWeek,

    workoutDays: workoutDays.length,

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
  regenerateCurrentWeek,
  getCurrentPlan,
  getTodayWorkout,
  generateWeeklyPlan,
  getNextWeekPlan,
  completeWorkoutDay,
  generateNextWeek,
  getPlanStats,
  skipWorkoutDay,
};