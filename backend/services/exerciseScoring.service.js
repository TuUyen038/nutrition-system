const UserExerciseStats = require("../models/UserExerciseStats");
const { weightedScore } = require("./trainingState.service");
const { exerciseScoring: CONFIG } = require("../config/adaptiveWorkout.config");
const { MUSCLE_ALIASES } = require("../utils/muscleGroups");

const DAY_MS = 24 * 60 * 60 * 1000;

const LEVEL_RANK = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

// =====================================
// HELPERS
// =====================================

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round2(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

/**
 * FNV-1a hash -> number in [0, 1). Same input, same output.
 */
function hash01(text) {
  let h = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  return (h >>> 0) / 4294967296;
}

/**
 * Same value for the whole week (weeks start on Monday).
 */
function weekKey(date) {
  const d = new Date(date);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;

  d.setUTCDate(d.getUTCDate() - daysSinceMonday);

  return d.toISOString().slice(0, 10);
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * ["chest", "triceps"] -> Set of every DB name for those groups.
 */
function expandMuscles(groups) {
  const names = new Set();

  groups.forEach((group) => {
    (MUSCLE_ALIASES[group] || [group]).forEach((n) => names.add(lower(n)));
  });

  return names;
}

function muscleNames(list) {
  return (list || [])
    .flatMap((m) => [lower(m.name_en), lower(m.name)])
    .filter(Boolean);
}

/**
 * Primary muscles of an exercise, as group names ("chest", "back"...),
 * used by the diversity rule.
 */
function primaryGroups(exercise) {
  const names = new Set(muscleNames(exercise.muscles));

  return Object.keys(MUSCLE_ALIASES).filter((group) =>
    MUSCLE_ALIASES[group].some((alias) => names.has(alias))
  );
}

// =====================================
// HARD FILTERS
// =====================================

/**
 * Returns the reason an exercise must not be suggested, or null.
 * Hard filters are about safety / feasibility, so they are never
 * traded off against a high score.
 */
function getExclusionReason(exercise, ctx) {
  const limitations = (ctx.user.limitations || []).map(lower);
  const avoidFor = (exercise.avoidFor || []).map(lower);

  if (avoidFor.some((tag) => limitations.includes(tag))) {
    return "limitation";
  }

  // Empty user.equipment = not filled in yet -> do not filter.
  const owned = (ctx.user.equipment || []).map(lower);

  if (owned.length) {
    const available = new Set([...owned, ...CONFIG.alwaysAvailableEquipment]);
    const needed = (exercise.equipment || []).map((e) => lower(e.name));

    if (needed.some((name) => !available.has(name))) {
      return "equipment";
    }
  }

  const exerciseRank = LEVEL_RANK[exercise.difficulty];
  const userRank = LEVEL_RANK[ctx.level] ?? 0;

  if (
    exerciseRank !== undefined &&
    exerciseRank - userRank > CONFIG.maxLevelsAboveUser
  ) {
    return "too_difficult";
  }

  if (
    exercise.impactLevel === "high" &&
    CONFIG.noHighImpactStatuses.includes(ctx.status)
  ) {
    return "high_impact";
  }

  return null;
}

// =====================================
// SCORE COMPONENTS (each 0-1, or null = no data)
// =====================================

function muscleMatch(exercise, focusMuscles) {
  if (!focusMuscles.size) return null;

  if (muscleNames(exercise.muscles).some((n) => focusMuscles.has(n))) {
    return 1;
  }

  if (muscleNames(exercise.muscles_secondary).some((n) => focusMuscles.has(n))) {
    return 0.5;
  }

  // Exercise came from the fallback list, unrelated to the focus.
  return 0;
}

function goalMatch(exercise, goal) {
  if (!goal) return null;

  if (exercise.suitableGoals?.length) {
    return exercise.suitableGoals.includes(goal) ? 1 : CONFIG.goalMismatchScore;
  }

  return CONFIG.goalFitByExerciseType[goal]?.[exercise.exerciseType] ?? null;
}

function levelMatch(exercise, level) {
  const exerciseRank = LEVEL_RANK[exercise.difficulty];

  if (exerciseRank === undefined) return null;

  const gap = exerciseRank - (LEVEL_RANK[level] ?? 0);

  return CONFIG.levelMatchByGap[gap] ?? 0;
}

/**
 * preferenceScore already mixes avg performance (70%) and how easy the
 * exercise felt (30%), see workoutSession.service.updateExerciseStats.
 */
function history(stat) {
  if (!stat || !stat.completedSessions) return null;

  return clamp01((stat.preferenceScore || 0) / 10);
}

function recency(exercise, stat, ctx) {
  let score = 1; // never done -> nothing to penalize

  if (stat?.lastPerformedAt) {
    const days = (ctx.now.getTime() - new Date(stat.lastPerformedAt).getTime()) / DAY_MS;
    const rule = CONFIG.recency.find((r) => days <= r.maxDays);

    if (rule) score = rule.score;
  }

  if (ctx.previousDayExerciseIds.includes(exercise.exerciseId)) {
    score = Math.min(score, CONFIG.previousDayScore);
  }

  return score;
}

function stateFit(exercise, readiness) {
  if (typeof exercise.fatigueScore !== "number" || typeof readiness !== "number") {
    return null;
  }

  const gap = exercise.fatigueScore - readiness;

  return gap > 0
    ? clamp01(1 - gap / CONFIG.stateFitHeavierRange)
    : clamp01(1 + gap / CONFIG.stateFitLighterRange);
}

// =====================================
// SCORE + RANK
// =====================================

function scoreExercise(exercise, ctx) {
  const stat = ctx.statsMap[exercise.exerciseId];

  const components = {
    muscleMatch: muscleMatch(exercise, ctx.focusMuscles),
    goalMatch: goalMatch(exercise, ctx.user.goal),
    levelMatch: levelMatch(exercise, ctx.level),
    history: history(stat),
    recency: recency(exercise, stat, ctx),
    stateFit: stateFit(exercise, ctx.readiness),
  };

  // weightedScore works on any scale; components are 0-1 here.
  const { score, usedWeights } = weightedScore(components, CONFIG.weights);

  return {
    exercise,
    score: round2(score ?? 0),
    components: Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, round2(v)])
    ),
    usedWeights,
    primaryGroups: primaryGroups(exercise),
    // Only used to break ties: differs per user and per week, but is
    // stable when the same plan is generated again.
    tieBreak: hash01(`${ctx.variationSeed}:${exercise.exerciseId}`),
  };
}

/**
 * Greedy pick: each round takes the best score after a penalty for
 * every primary muscle group already covered. Returns the whole list
 * in pick order, so the caller can skip items (calories) and continue.
 * Ties (same score to 2 decimals) -> tieBreak, so two users, or the
 * same user on two weeks, do not always get the same exercises.
 */
function orderWithDiversity(scored) {
  const remaining = [...scored];
  const ordered = [];
  const covered = new Map();

  while (remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    remaining.forEach((item, index) => {
      const overlap = item.primaryGroups.reduce(
        (sum, g) => sum + (covered.get(g) || 0),
        0
      );
      const value = round2(item.score - overlap * CONFIG.diversityPenalty);

      if (
        value > bestValue ||
        (value === bestValue && item.tieBreak > remaining[bestIndex].tieBreak)
      ) {
        bestIndex = index;
        bestValue = value;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);

    picked.finalScore = bestValue;
    picked.primaryGroups.forEach((g) => covered.set(g, (covered.get(g) || 0) + 1));
    ordered.push(picked);
  }

  return ordered;
}

/**
 * Main entry.
 *
 * exercises: candidates (from getExercisesByFocus)
 * options: { userId, user, level, focusGroups, state, previousDayExerciseIds,
 *            now, variationDate }
 * variationDate: picks the week used for tie-breaking (plan start date
 * when generating a plan; defaults to now).
 *
 * -> { ranked: [{ exercise, score, finalScore, components, usedWeights }],
 *      excluded: { reason: count } }
 */
async function rankExercises(exercises, {
  userId,
  user,
  level,
  focusGroups = [],
  state = {},
  previousDayExerciseIds = [],
  now = new Date(),
  variationDate = now,
}) {
  const stats = await UserExerciseStats.find({ userId }).lean();

  const statsMap = {};
  stats.forEach((s) => {
    statsMap[s.exerciseId] = s;
  });

  const ctx = {
    user: user || {},
    level,
    status: state.status,
    readiness: state.readinessScore,
    focusMuscles: expandMuscles(focusGroups),
    statsMap,
    previousDayExerciseIds,
    now,
    variationSeed: `${userId}:${weekKey(variationDate)}`,
  };

  const excluded = {};
  const allowed = [];

  exercises.forEach((exercise) => {
    const reason = getExclusionReason(exercise, ctx);

    if (reason) {
      excluded[reason] = (excluded[reason] || 0) + 1;
    } else {
      allowed.push(exercise);
    }
  });

  const scored = allowed.map((exercise) => scoreExercise(exercise, ctx));

  return {
    ranked: orderWithDiversity(scored),
    excluded,
  };
}

module.exports = {
  rankExercises,
  MUSCLE_ALIASES,
  expandMuscles,
  // exported for unit tests / step 8 calibration
  getExclusionReason,
  scoreExercise,
  orderWithDiversity,
};
