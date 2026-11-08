const WorkoutPlan = require("../models/WorkoutPlan");
const WorkoutSession = require("../models/WorkoutSession");
const Exercise = require("../models/Exercise");
const User = require("../models/User");
const googleHealthService = require("./googleHealth.service");
const { getTrainingState } = require("./trainingState.service");
const { rankExercises } = require("./exerciseScoring.service");
const {
  getExercisesByFocus,
  calculateCalories,
  getWorkoutLevel,
  MUSCLE_GROUP_MAPPINGS,
} = require("./workoutRecommendation.service");
const { toVNDateString } = require("../utils/date");
const { adaptivePlan: CONFIG } = require("../config/adaptiveWorkout.config");

const DAY_MS = 24 * 60 * 60 * 1000;

const INTENSITIES = ["light", "moderate", "vigorous"];

// Same mapping as generateAdaptiveWorkoutPlan uses for a new plan.
const DIFFICULTY_BY_INTENSITY = {
  light: 4,
  moderate: 6,
  vigorous: 8,
};

// =====================================
// HELPERS
// =====================================

function shiftIntensity(intensity, step) {
  const index = INTENSITIES.indexOf(intensity);
  const from = index === -1 ? 1 : index;

  return INTENSITIES[Math.min(2, Math.max(0, from + step))];
}

function sum(values) {
  return values.reduce((total, v) => total + v, 0);
}

function toPlain(detail) {
  return typeof detail.toObject === "function" ? detail.toObject() : { ...detail };
}

// =====================================
// DECISION (pure, unit-testable)
// =====================================

/**
 * input: {
 *   state: getTrainingState() result,
 *   todayActivity: { activeMinutes, steps, sleepMinutes } | null  (Google Health),
 *   weeklyActiveMinutes: number | null,
 *   weekProgress: { skippedWorkoutDays, completedWorkoutDays },
 * }
 * -> { action, reasons[], lowAdherence }
 *
 * Rules are checked from the most to the least protective; the first
 * that matches wins, so a safety rule can never be overridden by a
 * "train more" rule.
 */
function decideAdaptation({ state, todayActivity, weeklyActiveMinutes, weekProgress }) {
  const reasons = [];
  let action = "maintain";

  const { fatigueScore: fatigue, recoveryScore: recovery, performanceScore: performance } = state;
  const who = CONFIG.whoWeeklyMinutes;

  const activeToday = todayActivity?.activeMinutes ?? null;
  const sleepLastNight = todayActivity?.sleepMinutes ?? null;
  const stepsToday = todayActivity?.steps ?? null;
  const busyDay =
    (activeToday !== null && activeToday >= CONFIG.busyDayActiveMinutes) ||
    (stepsToday !== null && stepsToday >= CONFIG.busyDaySteps);

  if (state.status === "overreached") {
    action = "rest";
    reasons.push(
      `Quá tải: Fatigue ${fatigue}, Recovery ${recovery}, Readiness ${state.readinessScore}. Nghỉ buổi kế tiếp.`
    );
  } else if (state.status === "tired") {
    action = "light_session";
    reasons.push(
      `Đang mệt: Readiness ${state.readinessScore}. Buổi kế tiếp chuyển sang bài nhẹ, bớt 1 bài và 1 set.`
    );
  } else if (fatigue >= CONFIG.reduceWhenFatigueAtLeast || recovery <= CONFIG.reduceWhenRecoveryAtMost) {
    action = "reduce_intensity";
    reasons.push(
      `Fatigue ${fatigue} / Recovery ${recovery} chưa tốt: giảm 1 mức cường độ.`
    );
  } else if (sleepLastNight !== null && sleepLastNight < CONFIG.shortSleepMinutes) {
    action = "reduce_intensity";
    reasons.push(
      `Đêm qua ngủ ${Math.round((sleepLastNight / 60) * 10) / 10}h (< ${CONFIG.shortSleepMinutes / 60}h): giảm 1 mức cường độ.`
    );
  } else if (busyDay) {
    action = "reduce_intensity";
    reasons.push(
      `Hôm nay đã vận động nhiều ngoài app (${activeToday ?? "?"} phút, ${stepsToday ?? "?"} bước): giảm 1 mức cường độ.`
    );
  } else if (
    state.status === "ready" &&
    !state.isColdStart &&
    performance >= CONFIG.increaseMinPerformance &&
    (weeklyActiveMinutes === null || weeklyActiveMinutes < who.max)
  ) {
    action = "increase";
    reasons.push(
      weeklyActiveMinutes === null
        ? `Sẵn sàng (Readiness ${state.readinessScore}) và tập tốt (Performance ${performance}): tăng 1 mức cường độ.`
        : `Sẵn sàng (Readiness ${state.readinessScore}), tập tốt (Performance ${performance}), mới vận động ${weeklyActiveMinutes}/${who.min}–${who.max} phút/tuần theo WHO: tăng 1 mức cường độ.`
    );
  } else {
    reasons.push(`Trạng thái ${state.status} (Readiness ${state.readinessScore}): giữ nguyên plan.`);
  }

  const lowAdherence = weekProgress.skippedWorkoutDays >= CONFIG.lowAdherenceSkips;

  if (lowAdherence) {
    if (action === "increase") {
      action = "maintain";
      reasons.length = 0;
      reasons.push("Tập tốt nhưng bỏ nhiều buổi: không tăng cường độ.");
    }

    reasons.push(
      `Đã bỏ ${weekProgress.skippedWorkoutDays} buổi tuần này: bớt 1 bài mỗi buổi để dễ hoàn thành hơn.`
    );
  }

  return { action, reasons, lowAdherence };
}

// =====================================
// WEEK PROGRESS
// =====================================

/**
 * Original type of a day: what generateAdaptiveWorkoutPlan created,
 * even if step 6 has turned it into a rest day since.
 */
function baseType(day) {
  return day.original?.type || day.type;
}

function getWeekProgress(plan, today) {
  const workoutDays = plan.days.filter((d) => baseType(d) === "workout");

  // A past workout day that was neither completed nor skipped counts as
  // skipped: the user did not do it.
  const skipped = workoutDays.filter(
    (d) =>
      d.skipped ||
      (!d.completed && toVNDateString(d.date) < today && d.type === "workout")
  );

  return {
    workoutDays: workoutDays.length,
    // A day turned into rest by step 6 is auto-completed as a rest day:
    // it was not trained, so it does not count as completed.
    completedWorkoutDays: workoutDays.filter((d) => d.completed && d.type === "workout").length,
    skippedWorkoutDays: skipped.length,
  };
}

/**
 * Minutes of activity in the last 7 days: Google Health active minutes
 * (which already include manual exercise sessions, step 3) + workouts
 * done in the app. null when neither source has anything.
 */
async function getWeeklyActiveMinutes(userId, activity, now) {
  const googleValues = activity.daily
    .map((d) => d.activeMinutes)
    .filter((v) => v !== null);

  const sessions = await WorkoutSession.find({
    userId,
    completed: true,
    endTime: { $gte: new Date(now.getTime() - 7 * DAY_MS), $lte: now },
  })
    .select("durationMinutes")
    .lean();

  if (!googleValues.length && !sessions.length) return null;

  return Math.round(sum(googleValues) + sum(sessions.map((s) => s.durationMinutes || 0)));
}

// =====================================
// APPLY TO ONE DAY
// =====================================

function saveOriginal(day) {
  if (day.original?.type) return;

  day.original = {
    type: day.type,
    focus: day.focus,
    estimatedDifficulty: day.estimatedDifficulty,
    exerciseDetails: day.exerciseDetails.map(toPlain),
  };
}

function restoreOriginal(day) {
  if (!day.original?.type) return;

  day.type = day.original.type;
  day.focus = day.original.focus;
  day.estimatedDifficulty = day.original.estimatedDifficulty;
  day.exerciseDetails = day.original.exerciseDetails.map(toPlain);
  day.estimatedCalories = sum(day.exerciseDetails.map((e) => e.calories || 0));
  day.totalDuration = sum(day.exerciseDetails.map((e) => e.duration || 0));
}

/**
 * Light exercises for a focus, reusing step 5 with a "tired" state:
 * high-impact exercises are filtered out and stateFit prefers exercises
 * with a low fatigueScore. Cached per focus for one adaptation run.
 */
async function getLightExercises(focus, ctx) {
  if (!ctx.lightCache[focus]) {
    const candidates = await getExercisesByFocus(focus);
    const { ranked } = await rankExercises(candidates, {
      userId: ctx.userId,
      user: ctx.user,
      level: ctx.level,
      focusGroups: MUSCLE_GROUP_MAPPINGS[focus] || [],
      state: { status: "tired", readinessScore: 3 },
      now: ctx.now,
    });

    ctx.lightCache[focus] = ranked;
  }

  return ctx.lightCache[focus];
}

/**
 * Step 7: re-apply the exercises the user replaced on this day, in the
 * order they were replaced (A -> B then B -> C ends as C).
 */
function applySubstitutions(details, substitutions) {
  for (const sub of substitutions || []) {
    const index = details.findIndex((d) => d.exerciseId === sub.fromExerciseId);

    if (index === -1) continue;
    if (details.some((d) => d.exerciseId === sub.toExerciseId)) continue;

    details[index] = {
      ...details[index],
      exerciseId: sub.toExerciseId,
      name: sub.toName,
      score: null,
    };
  }

  return details;
}

async function applyToDay(day, action, decision, ctx) {
  const rule = CONFIG.actions[action];
  const lowAdherenceDelta = decision.lowAdherence ? CONFIG.lowAdherence.exerciseDelta : 0;

  // Nothing to change and never adapted -> leave the day untouched.
  if (action === "maintain" && !lowAdherenceDelta && !day.original?.type) {
    return null;
  }

  saveOriginal(day);

  const before = { type: day.type, intensity: day.exerciseDetails[0]?.intensity, exercises: day.exerciseDetails.length };

  if (action === "maintain" && !lowAdherenceDelta) {
    // State is fine again: undo any earlier adaptation of this day.
    restoreOriginal(day);
  } else if (rule.toRest) {
    day.type = "rest";
    day.focus = "recovery";
    day.exerciseDetails = [];
    day.estimatedCalories = 0;
    day.totalDuration = 0;
    day.estimatedDifficulty = 1;
  } else {
    const base = day.original;
    const baseDetails = base.exerciseDetails.map(toPlain);

    const count = Math.max(
      CONFIG.minExercises,
      baseDetails.length + (rule.exerciseDelta || 0) + lowAdherenceDelta
    );

    let details = baseDetails.slice(0, count);

    if (rule.swapToLight && baseDetails.length) {
      const light = await getLightExercises(base.focus, ctx);
      const template = baseDetails[0];

      details = light.slice(0, count).map((item) => ({
        exerciseId: item.exercise.exerciseId,
        name: item.exercise.name,
        sets: template.sets,
        reps: template.reps,
        duration: template.duration,
        score: item.finalScore,
      }));
    }

    applySubstitutions(details, day.substitutions);

    const intensity =
      rule.intensity || shiftIntensity(baseDetails[0]?.intensity, rule.intensityStep || 0);

    const exerciseDocs = await Exercise.find({
      exerciseId: { $in: details.map((d) => d.exerciseId) },
    }).lean();

    const docById = Object.fromEntries(exerciseDocs.map((e) => [e.exerciseId, e]));

    for (const detail of details) {
      detail.sets = Math.max(CONFIG.minSets, (detail.sets || 0) + (rule.setsDelta || 0));
      detail.intensity = intensity;
      detail.calories = await calculateCalories(
        docById[detail.exerciseId] || {},
        ctx.user.weight,
        detail.duration,
        intensity
      );
    }

    day.type = "workout";
    day.focus = base.focus;
    day.exerciseDetails = details;
    day.estimatedCalories = sum(details.map((d) => d.calories || 0));
    day.totalDuration = sum(details.map((d) => d.duration || 0));
    day.estimatedDifficulty = DIFFICULTY_BY_INTENSITY[intensity];
  }

  day.adaptation = {
    action,
    reasons: decision.reasons,
    appliedAt: ctx.now,
  };

  return {
    day: day.day,
    date: toVNDateString(day.date),
    action,
    from: before,
    to: {
      type: day.type,
      intensity: day.exerciseDetails[0]?.intensity ?? null,
      exercises: day.exerciseDetails.length,
    },
  };
}

// =====================================
// MAIN
// =====================================

/**
 * Re-evaluate the user's state and adapt the days of the active plan
 * that have not happened yet. Past, completed, skipped and started days
 * are never changed.
 *
 * options: { sync: pull Google first, dryRun: do not save, now,
 *            planId: a given plan (just generated) instead of the active one }
 */
async function adaptPlan(
  userId,
  { sync = false, dryRun = false, now = new Date(), planId = null } = {}
) {
  const plan = planId
    ? await WorkoutPlan.findOne({ _id: planId, userId })
    : await WorkoutPlan.findOne({ userId, isActive: true });

  if (!plan) {
    const error = new Error("Workout plan not found");
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(userId).lean();
  const today = toVNDateString(now);

  const [state, activity] = await Promise.all([
    getTrainingState(userId, { sync, now }),
    googleHealthService.getActivitySummary(userId, 7),
  ]);

  const todayRecord = activity.daily.find((d) => d.date === today) || null;
  const weeklyActiveMinutes = await getWeeklyActiveMinutes(userId, activity, now);
  const weekProgress = getWeekProgress(plan, today);

  const decision = decideAdaptation({
    state,
    todayActivity: todayRecord,
    weeklyActiveMinutes,
    weekProgress,
  });

  // A day with a started session is in progress: do not touch it.
  const startedDays = new Set(
    await WorkoutSession.distinct("day", { userId, planId: plan._id })
  );

  const upcoming = plan.days
    .filter(
      (d) =>
        baseType(d) === "workout" &&
        toVNDateString(d.date) >= today &&
        !d.completed &&
        !d.skipped &&
        !startedDays.has(d.day)
    )
    .sort((a, b) => a.day - b.day);

  const ctx = {
    userId,
    user: user || {},
    level: getWorkoutLevel(user?.fitnessLevel),
    now,
    lightCache: {},
  };

  const changes = [];

  for (let i = 0; i < upcoming.length; i++) {
    const action =
      i === 0 ? decision.action : CONFIG.followUpAction[decision.action] || decision.action;

    const change = await applyToDay(upcoming[i], action, decision, ctx);

    if (change) changes.push(change);
  }

  plan.weeklyEstimatedCalories = sum(plan.days.map((d) => d.estimatedCalories || 0));
  plan.fatigueScore = state.fatigueScore;
  plan.recoveryScore = state.recoveryScore;
  plan.avgPerformanceScore = state.performanceScore;
  plan.readinessScore = state.readinessScore;
  plan.lastAdaptedAt = now;

  // Log only when the decision changes, so a daily re-check that keeps
  // the same decision does not fill the history.
  const last = plan.adaptations
    ?.filter((a) => (a.source || "daily") === "daily")
    .pop();

  if (
    !last ||
    last.action !== decision.action ||
    last.reasons.join("|") !== decision.reasons.join("|")
  ) {
    plan.adaptations.push({
      at: now,
      source: "daily",
      action: decision.action,
      reasons: decision.reasons,
      status: state.status,
      readinessScore: state.readinessScore,
      fatigueScore: state.fatigueScore,
      recoveryScore: state.recoveryScore,
      days: changes.map((c) => c.day),
    });

    if (plan.adaptations.length > CONFIG.maxHistory) {
      plan.adaptations.splice(0, plan.adaptations.length - CONFIG.maxHistory);
    }
  }

  if (!dryRun) {
    await plan.save();
  }

  return {
    dryRun,
    decision,
    state: {
      status: state.status,
      readinessScore: state.readinessScore,
      fatigueScore: state.fatigueScore,
      recoveryScore: state.recoveryScore,
      performanceScore: state.performanceScore,
      isColdStart: state.isColdStart,
      googleSync: state.dataAvailability.googleSync,
    },
    activity: {
      today: todayRecord
        ? { activeMinutes: todayRecord.activeMinutes, steps: todayRecord.steps, sleepMinutes: todayRecord.sleepMinutes }
        : null,
      weeklyActiveMinutes,
      whoWeeklyMinutes: CONFIG.whoWeeklyMinutes,
    },
    weekProgress,
    changes,
    plan,
  };
}

/**
 * Run adaptPlan at most once per (VN) day. Used by getTodayWorkout so
 * the plan follows the user's state without an extra call from the app.
 * Never throws: the workout of the day must load even if this fails.
 */
async function adaptPlanIfDue(userId, now = new Date()) {
  try {
    const plan = await WorkoutPlan.findOne({ userId, isActive: true })
      .select("lastAdaptedAt")
      .lean();

    if (!plan) return null;

    if (plan.lastAdaptedAt && toVNDateString(plan.lastAdaptedAt) === toVNDateString(now)) {
      return null;
    }

    return await adaptPlan(userId, { now });
  } catch (error) {
    console.error("[AdaptivePlan] adaptPlanIfDue:", error.message || error);
    return null;
  }
}

module.exports = {
  adaptPlan,
  adaptPlanIfDue,
  // exported for unit tests / step 8 calibration
  decideAdaptation,
  getWeekProgress,
  shiftIntensity,
  applySubstitutions,
};
