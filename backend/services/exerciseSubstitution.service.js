const WorkoutPlan = require("../models/WorkoutPlan");
const WorkoutSession = require("../models/WorkoutSession");
const Exercise = require("../models/Exercise");
const User = require("../models/User");
const UserExerciseStats = require("../models/UserExerciseStats");
const { getTrainingState } = require("./trainingState.service");
const {
  rankExercises,
  primaryGroups,
  expandMuscles,
  LEVEL_RANK,
} = require("./exerciseScoring.service");
const {
  getExercisesByFocus,
  calculateCalories,
  getWorkoutLevel,
  MUSCLE_GROUP_MAPPINGS,
} = require("./workoutRecommendation.service");
const { toVNDateString } = require("../utils/date");
const {
  exerciseSubstitution: CONFIG,
  exerciseScoring: SCORING_CONFIG,
} = require("../config/adaptiveWorkout.config");

/**
 * Step 7: replace one exercise of a plan day.
 *
 * Alternatives = exercises that train the same primary muscles, scored
 * with the step 5 ranking (limitations, equipment, level, history,
 * state...) plus how close they are to the exercise being replaced
 * (same muscles, similar difficulty, similar calories), so the day
 * keeps the same purpose and roughly the same load.
 */

const REASONS = Object.keys(CONFIG.reasons);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function sum(values) {
  return values.reduce((total, v) => total + v, 0);
}

function toPlain(doc) {
  return typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

// =====================================
// LOAD + CHECKS
// =====================================

/**
 * Plan day + exercise the user wants to change, with the checks shared
 * by "alternatives" and "replace".
 */
async function loadTarget(userId, dayNumber, exerciseId, now) {
  const plan = await WorkoutPlan.findOne({ userId, isActive: true });

  if (!plan) throw httpError(404, "Workout plan not found");

  const day = plan.days.find((d) => d.day === dayNumber);

  if (!day) throw httpError(404, `Day ${dayNumber} not found`);

  if (day.type !== "workout") throw httpError(400, "Ngày này là ngày nghỉ, không có bài để đổi");
  if (day.completed) throw httpError(400, "Ngày này đã hoàn thành, không đổi bài được");
  if (day.skipped) throw httpError(400, "Ngày này đã bỏ qua, không đổi bài được");

  if (toVNDateString(day.date) < toVNDateString(now)) {
    throw httpError(400, "Ngày này đã qua, không đổi bài được");
  }

  const detail = day.exerciseDetails.find((e) => e.exerciseId === exerciseId);

  if (!detail) throw httpError(404, `Exercise ${exerciseId} is not in day ${dayNumber}`);

  const original = await Exercise.findOne({ exerciseId }).lean();

  if (!original) throw httpError(404, `Exercise ${exerciseId} not found`);

  return { plan, day, detail, original };
}

/**
 * Session already started (running) or done for this exercise on this
 * day -> the exercise cannot be replaced any more.
 */
async function getSessionBlock(userId, plan, dayNumber, exerciseId) {
  const session = await WorkoutSession.findOne({
    userId,
    planId: plan._id,
    day: dayNumber,
    exerciseId,
  })
    .select("endTime completed")
    .lean();

  if (!session) return null;

  return session.endTime ? "Bài này đã tập xong" : "Bài này đang được tập";
}

// =====================================
// CANDIDATES
// =====================================

/**
 * Exercises of the day's focus + exercises sharing a primary muscle with
 * the original (the focus pool is capped, so a muscle-specific query
 * finds exercises the focus pool may have cut off).
 */
async function getCandidates(day, original, groups) {
  const names = [...expandMuscles(groups)].map((n) => new RegExp(`^${n}$`, "i"));

  const [focusPool, musclePool] = await Promise.all([
    getExercisesByFocus(day.focus),
    names.length
      ? Exercise.find({
          $or: [{ "muscles.name_en": { $in: names } }, { "muscles.name": { $in: names } }],
          activityType: { $in: ["strength_training", "functional_training", "calisthenics"] },
        })
          .limit(SCORING_CONFIG.candidatePoolSize)
          .lean()
      : [],
  ]);

  const inDay = new Set(day.exerciseDetails.map((e) => e.exerciseId));
  const byId = new Map();

  [...focusPool, ...musclePool].forEach((exercise) => {
    if (exercise.exerciseId === original.exerciseId) return;
    if (inDay.has(exercise.exerciseId)) return;

    byId.set(exercise.exerciseId, exercise);
  });

  return [...byId.values()];
}

/**
 * Extra filter from the reason the user gave ("too_hard", "pain"...).
 * Returns why the candidate does not fit the reason, or null.
 */
function reasonMismatch(candidate, original, reason) {
  const rule = CONFIG.reasons[reason] || {};

  if (rule.maxDifficultyGap !== undefined) {
    const gap = (LEVEL_RANK[candidate.difficulty] ?? 0) - (LEVEL_RANK[original.difficulty] ?? 0);

    if (gap > rule.maxDifficultyGap) return "harder";
  }

  if (
    rule.maxFatigueGap !== undefined &&
    typeof candidate.fatigueScore === "number" &&
    typeof original.fatigueScore === "number" &&
    candidate.fatigueScore - original.fatigueScore > rule.maxFatigueGap
  ) {
    return "heavier";
  }

  if (rule.bodyweightOnly) {
    const free = new Set(SCORING_CONFIG.alwaysAvailableEquipment);

    if ((candidate.equipment || []).some((e) => !free.has(lower(e.name)))) {
      return "needs_equipment";
    }
  }

  if (rule.impactLevels && !rule.impactLevels.includes(candidate.impactLevel || "medium")) {
    return "impact";
  }

  return null;
}

// =====================================
// SIMILARITY (0-1)
// =====================================

function muscleSimilarity(candidateGroups, originalGroups) {
  if (!originalGroups.length) return null;

  const a = new Set(candidateGroups);
  const b = new Set(originalGroups);
  const shared = [...a].filter((g) => b.has(g)).length;
  const union = new Set([...a, ...b]).size;

  return union ? shared / union : 0;
}

function difficultySimilarity(candidate, original) {
  const a = LEVEL_RANK[candidate.difficulty];
  const b = LEVEL_RANK[original.difficulty];

  if (a === undefined || b === undefined) return null;

  return 1 - Math.abs(a - b) / 2;
}

function caloriesSimilarity(calories, originalCalories) {
  if (!originalCalories || typeof calories !== "number") return null;

  const { caloriesTolerance, caloriesZeroAt } = CONFIG.similarity;
  const diff = Math.abs(calories - originalCalories) / originalCalories;

  if (diff <= caloriesTolerance) return 1;

  return clamp01(1 - (diff - caloriesTolerance) / (caloriesZeroAt - caloriesTolerance));
}

/**
 * Weighted mean of the parts that have data (same rule as the other
 * scores: a missing part is skipped, the others re-normalized).
 */
function combine(parts, weights) {
  let total = 0;
  let weightSum = 0;

  Object.entries(parts).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    total += value * weights[key];
    weightSum += weights[key];
  });

  return weightSum ? total / weightSum : 0;
}

/**
 * Calories only depend on activityType (MET) for a given duration and
 * intensity: compute once per activityType.
 */
function caloriesCalculator(weight, duration, intensity) {
  const cache = new Map();

  return async (exercise) => {
    const key = exercise.activityType || "";

    if (!cache.has(key)) {
      cache.set(key, await calculateCalories(exercise, weight, duration, intensity));
    }

    return cache.get(key);
  };
}

// =====================================
// ALTERNATIVES
// =====================================

/**
 * GET alternatives for one exercise of a plan day.
 * options: { limit, reason, now }
 */
async function getAlternatives(
  userId,
  dayNumber,
  exerciseId,
  { limit = CONFIG.defaultLimit, reason = null, now = new Date() } = {}
) {
  if (reason && !REASONS.includes(reason)) {
    throw httpError(400, `reason must be one of: ${REASONS.join(", ")}`);
  }

  const { plan, day, detail, original } = await loadTarget(userId, dayNumber, exerciseId, now);

  const sessionBlock = await getSessionBlock(userId, plan, dayNumber, exerciseId);

  const user = await User.findById(userId).lean();
  const level = getWorkoutLevel(user?.fitnessLevel);
  const state = await getTrainingState(userId, { now });

  const originalGroups = primaryGroups(original);
  const focusGroups = originalGroups.length
    ? originalGroups
    : MUSCLE_GROUP_MAPPINGS[day.focus] || [];

  const candidates = await getCandidates(day, original, focusGroups);

  // Reason filter first (cheap), then the step 5 hard filters + score.
  const reasonExcluded = {};
  const kept = candidates.filter((candidate) => {
    const why = reason ? reasonMismatch(candidate, original, reason) : null;

    if (why) reasonExcluded[why] = (reasonExcluded[why] || 0) + 1;

    return !why;
  });

  const { ranked, excluded } = await rankExercises(kept, {
    userId,
    user,
    level,
    focusGroups,
    state,
    now,
  });

  const caloriesOf = caloriesCalculator(user?.weight || 60, detail.duration, detail.intensity);
  const weights = CONFIG.weights;

  const scored = [];

  for (const item of ranked) {
    const muscle = muscleSimilarity(item.primaryGroups, originalGroups);

    // Must train at least one of the original's primary muscles.
    if (muscle === 0) continue;

    const calories = await caloriesOf(item.exercise);

    const similarityParts = {
      muscle,
      difficulty: difficultySimilarity(item.exercise, original),
      calories: caloriesSimilarity(calories, detail.calories),
    };

    const similarity = combine(similarityParts, CONFIG.similarity.weights);
    const finalScore = weights.ranking * item.score + weights.similarity * similarity;

    scored.push({
      exerciseId: item.exercise.exerciseId,
      name: item.exercise.name,
      difficulty: item.exercise.difficulty ?? null,
      impactLevel: item.exercise.impactLevel ?? null,
      equipment: (item.exercise.equipment || []).map((e) => e.name),
      primaryGroups: item.primaryGroups,
      calories,
      finalScore: round2(finalScore),
      rankingScore: item.score,
      similarity: round2(similarity),
      similarityParts: Object.fromEntries(
        Object.entries(similarityParts).map(([k, v]) => [k, v === null ? null : round2(v)])
      ),
      components: item.components,
      tieBreak: item.tieBreak,
    });
  }

  scored.sort((a, b) => b.finalScore - a.finalScore || b.tieBreak - a.tieBreak);

  return {
    day: dayNumber,
    canReplace: !sessionBlock,
    blockedReason: sessionBlock,
    reason,
    original: {
      exerciseId: original.exerciseId,
      name: original.name,
      difficulty: original.difficulty ?? null,
      primaryGroups: originalGroups,
      sets: detail.sets,
      reps: detail.reps,
      duration: detail.duration,
      intensity: detail.intensity,
      calories: detail.calories,
    },
    candidates: candidates.length,
    excluded: { ...excluded, ...reasonExcluded },
    alternatives: scored
      .slice(0, Math.min(CONFIG.maxLimit, Math.max(1, limit)))
      .map(({ tieBreak, ...rest }) => rest),
  };
}

// =====================================
// REPLACE
// =====================================

function recomputeDay(day) {
  day.estimatedCalories = sum(day.exerciseDetails.map((e) => e.calories || 0));
  day.totalDuration = sum(day.exerciseDetails.map((e) => e.duration || 0));
}

/**
 * PATCH: replace exerciseId by newExerciseId on a plan day.
 * Keeps sets / reps / duration / intensity of the replaced exercise,
 * recomputes calories, and records the change so step 6 re-applies it.
 */
async function replaceExercise(
  userId,
  dayNumber,
  exerciseId,
  { newExerciseId, reason = "other", now = new Date() } = {}
) {
  if (!Number.isInteger(newExerciseId)) {
    throw httpError(400, "newExerciseId (number) is required");
  }

  if (!REASONS.includes(reason)) {
    throw httpError(400, `reason must be one of: ${REASONS.join(", ")}`);
  }

  if (newExerciseId === exerciseId) {
    throw httpError(400, "Bài mới trùng với bài cũ");
  }

  const { plan, day, detail, original } = await loadTarget(userId, dayNumber, exerciseId, now);

  const sessionBlock = await getSessionBlock(userId, plan, dayNumber, exerciseId);

  if (sessionBlock) throw httpError(409, `${sessionBlock}, không đổi được`);

  if (day.exerciseDetails.some((e) => e.exerciseId === newExerciseId)) {
    throw httpError(409, "Bài mới đã có trong ngày này");
  }

  const replacement = await Exercise.findOne({ exerciseId: newExerciseId }).lean();

  if (!replacement) throw httpError(404, `Exercise ${newExerciseId} not found`);

  // Same safety rules as the plan (limitations, equipment, level,
  // high impact when tired), whatever the app sends.
  const user = await User.findById(userId).lean();
  const level = getWorkoutLevel(user?.fitnessLevel);
  const state = await getTrainingState(userId, { now });
  const originalGroups = primaryGroups(original);

  const { ranked, excluded } = await rankExercises([replacement], {
    userId,
    user,
    level,
    focusGroups: originalGroups.length ? originalGroups : MUSCLE_GROUP_MAPPINGS[day.focus] || [],
    state,
    now,
  });

  if (!ranked.length) {
    throw httpError(400, `Bài này không phù hợp với bạn (${Object.keys(excluded).join(", ")})`);
  }

  const calories = await calculateCalories(
    replacement,
    user?.weight || 60,
    detail.duration,
    detail.intensity
  );

  const index = day.exerciseDetails.findIndex((e) => e.exerciseId === exerciseId);
  const { _id, ...previous } = toPlain(day.exerciseDetails[index]);

  // splice: works on both Mongoose arrays (marks the path modified) and
  // plain arrays.
  day.exerciseDetails.splice(index, 1, {
    ...previous,
    exerciseId: replacement.exerciseId,
    name: replacement.name,
    calories,
    score: ranked[0].score,
  });

  // The day was adapted by step 6: change its base too, so a later
  // adaptation (computed from the base) keeps the user's choice.
  if (day.original?.exerciseDetails?.length) {
    const baseIndex = day.original.exerciseDetails.findIndex((e) => e.exerciseId === exerciseId);

    if (
      baseIndex !== -1 &&
      !day.original.exerciseDetails.some((e) => e.exerciseId === newExerciseId)
    ) {
      const { _id: baseId, ...baseObj } = toPlain(day.original.exerciseDetails[baseIndex]);

      day.original.exerciseDetails.splice(baseIndex, 1, {
        ...baseObj,
        exerciseId: replacement.exerciseId,
        name: replacement.name,
        calories: await calculateCalories(
          replacement,
          user?.weight || 60,
          baseObj.duration,
          baseObj.intensity
        ),
        score: ranked[0].score,
      });
    }
  }

  day.substitutions = day.substitutions || [];
  day.substitutions.push({
    fromExerciseId: exerciseId,
    fromName: original.name,
    toExerciseId: replacement.exerciseId,
    toName: replacement.name,
    reason,
    at: now,
  });

  recomputeDay(day);
  plan.weeklyEstimatedCalories = sum(plan.days.map((d) => d.estimatedCalories || 0));

  await plan.save();

  // Remember why, so the scoring of later weeks takes it into account:
  // "pain" -> not suggested for a while, "dislike" -> lower score.
  const feedbackField = { pain: "painReportedAt", dislike: "dislikedAt" }[reason];

  if (feedbackField) {
    await UserExerciseStats.updateOne(
      { userId, exerciseId },
      { $set: { [feedbackField]: now } },
      { upsert: true }
    );
  }

  return {
    day: dayNumber,
    replaced: {
      from: { exerciseId, name: original.name, calories: detail.calories },
      to: {
        exerciseId: replacement.exerciseId,
        name: replacement.name,
        calories,
        score: ranked[0].score,
      },
      reason,
    },
    dayTotals: {
      estimatedCalories: day.estimatedCalories,
      totalDuration: day.totalDuration,
    },
    plan,
  };
}

module.exports = {
  getAlternatives,
  replaceExercise,
  REASONS,
  // exported for unit tests / step 8 calibration
  muscleSimilarity,
  difficultySimilarity,
  caloriesSimilarity,
  reasonMismatch,
};
