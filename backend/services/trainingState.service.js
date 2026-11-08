const dayjs = require("dayjs");

const WorkoutSession = require("../models/WorkoutSession");
const WorkoutPlan = require("../models/WorkoutPlan");
const googleHealthService = require("./googleHealth.service");
const { toVNDateString } = require("../utils/date");
const { trainingState: CONFIG } = require("../config/adaptiveWorkout.config");

const DAY_MS = 24 * 60 * 60 * 1000;

// =====================================
// HELPERS
// =====================================

function clamp(value, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

function average(values) {
  if (!values.length) return null;

  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Weighted average that skips missing components and re-normalizes
 * the remaining weights. This is how "use only the available metrics"
 * is implemented everywhere in this file.
 *
 * components: { name: number | null }, weights: { name: number }
 * -> { score, usedWeights } or { score: null } when nothing is available.
 */
function weightedScore(components, weights) {
  const available = Object.keys(weights).filter(
    (name) => components[name] !== null && components[name] !== undefined
  );

  const totalWeight = available.reduce((sum, name) => sum + weights[name], 0);

  if (!available.length || totalWeight === 0) {
    return { score: null, usedWeights: {} };
  }

  const usedWeights = {};
  let score = 0;

  available.forEach((name) => {
    usedWeights[name] = Math.round((weights[name] / totalWeight) * 100) / 100;
    score += components[name] * (weights[name] / totalWeight);
  });

  return { score: clamp(score), usedWeights };
}

/**
 * Linear map: value <= low -> 0, value >= high -> 10.
 */
function linearScore(value, low, high) {
  return clamp(((value - low) / (high - low)) * 10);
}

/**
 * x / (x + reference) * 10: 0 -> 0, reference -> 5, grows toward 10
 * but never exceeds it. Keeps very large loads on the 0-10 scale.
 */
function saturatingScore(value, reference) {
  if (reference <= 0) return 0;

  return clamp((value / (value + reference)) * 10);
}

function daysAgo(date, now) {
  return (now.getTime() - new Date(date).getTime()) / DAY_MS;
}

/**
 * Average decay factor of one day's load over the acute window
 * (~0.47 for a 2-day half-life over 7 days).
 */
function averageDecay(cfg) {
  let total = 0;

  for (let d = 0; d < cfg.acuteWindowDays; d++) {
    total += Math.pow(0.5, d / cfg.loadHalfLifeDays);
  }

  return total / cfg.acuteWindowDays;
}

function sessionLoad(session) {
  return (session.durationMinutes || 0) * (session.perceivedDifficulty || 5);
}

// =====================================
// FATIGUE
// =====================================

function calculateFatigue({ sessions, activity, now }) {
  const cfg = CONFIG.fatigue;

  // Acute load: last 7 days, each session decays with its age.
  const acuteSessions = sessions.filter(
    (s) => daysAgo(s.endTime, now) <= cfg.acuteWindowDays
  );

  const acuteLoad = acuteSessions.reduce((sum, s) => {
    const decay = Math.pow(0.5, daysAgo(s.endTime, now) / cfg.loadHalfLifeDays);

    return sum + sessionLoad(s) * decay;
  }, 0);

  // Personal reference: average weekly load over the last 28 days.
  // Someone who always trains hard gets a higher reference, so the same
  // load tires them less than a beginner.
  const chronicWeeklyLoad =
    sessions
      .filter((s) => daysAgo(s.endTime, now) <= cfg.chronicWindowDays)
      .reduce((sum, s) => sum + sessionLoad(s), 0) /
    (cfg.chronicWindowDays / 7);

  const referenceLoad = Math.max(cfg.minReferenceLoad, chronicWeeklyLoad);

  // acuteLoad is decayed, so compare it with what the usual weekly load
  // would give after the same decay (spread evenly over 7 days).
  const expectedAcuteLoad = referenceLoad * averageDecay(cfg);
  const workloadRatio = acuteLoad / expectedAcuteLoad;

  const training = sessions.length
    ? clamp((workloadRatio / cfg.overloadRatio) * 10)
    : null;

  // Daily activity from Google Health (last 2 days).
  const recentMinutes = activity.daily
    .filter((d) => daysAgo(dayjs(d.date).toDate(), now) <= cfg.activityWindowDays)
    .map((d) => d.activeMinutes)
    .filter((v) => v !== null);

  const dailyActivity = recentMinutes.length
    ? saturatingScore(average(recentMinutes), cfg.referenceActiveMinutesPerDay)
    : null;

  const components = { training, dailyActivity };
  const { score, usedWeights } = weightedScore(components, cfg.weights);

  return {
    score: round1(score),
    components: {
      training: round1(training),
      dailyActivity: round1(dailyActivity),
    },
    usedWeights,
    details: {
      acuteLoad: Math.round(acuteLoad),
      referenceLoad: Math.round(referenceLoad),
      workloadRatio: Math.round(workloadRatio * 100) / 100,
      sessionsLast7Days: acuteSessions.length,
    },
  };
}

// =====================================
// RECOVERY
// =====================================

function calculateRecovery({ sessions, activity, now }) {
  const cfg = CONFIG.recovery;
  const today = toVNDateString(now);

  // Sleep of last night = sleep record of today (a sleep is stored on
  // the day it ends, see step 3).
  const lastNight = activity.daily.find((d) => d.date === today);
  const sleepMinutes = lastNight?.sleepMinutes ?? null;

  const sleep =
    sleepMinutes === null
      ? null
      : linearScore(sleepMinutes, cfg.sleepMinMinutes, cfg.sleepGoodMinutes);

  // Time since last hard session (RPE >= 7).
  const lastHard = sessions.find(
    (s) => (s.perceivedDifficulty || 0) >= cfg.hardSessionRpe
  );

  const hoursSinceHard = lastHard
    ? daysAgo(lastHard.endTime, now) * 24
    : null;

  const timeSinceHardSession =
    hoursSinceHard === null
      ? 10 // never trained hard -> nothing to recover from
      : linearScore(hoursSinceHard, 0, cfg.fullRecoveryHours);

  // Rest days in the last 7 days = days without any completed session.
  const trainedDays = new Set(
    sessions
      .filter((s) => daysAgo(s.endTime, now) <= 7)
      .map((s) => toVNDateString(s.endTime))
  );

  const restDaysCount = 7 - trainedDays.size;
  const restDays = clamp((restDaysCount / cfg.restDaysForFullScore) * 10);

  const components = { sleep, timeSinceHardSession, restDays };
  const { score, usedWeights } = weightedScore(components, cfg.weights);

  return {
    score: round1(score),
    components: {
      sleep: round1(sleep),
      timeSinceHardSession: round1(timeSinceHardSession),
      restDays: round1(restDays),
    },
    usedWeights,
    details: {
      sleepMinutes,
      hoursSinceHardSession: hoursSinceHard === null ? null : Math.round(hoursSinceHard),
      restDaysLast7: restDaysCount,
    },
  };
}

// =====================================
// PERFORMANCE
// =====================================

function calculateCompletionRate(plan, now) {
  if (!plan?.days?.length) return null;

  const today = toVNDateString(now);

  // Only workout days that already happened (today included).
  const pastWorkoutDays = plan.days.filter(
    (d) => d.type === "workout" && toVNDateString(d.date) <= today
  );

  if (!pastWorkoutDays.length) return null;

  const completed = pastWorkoutDays.filter((d) => d.completed).length;

  return completed / pastWorkoutDays.length;
}

function calculatePerformance({ sessions, plan, now }) {
  const cfg = CONFIG.performance;

  const inWindow = (s, from, to) => {
    const age = daysAgo(s.endTime, now);
    return age >= from && age < to;
  };

  const scoresBetween = (from, to) =>
    sessions
      .filter((s) => inWindow(s, from, to))
      .map((s) => s.performanceScore)
      .filter((v) => Number.isFinite(v));

  const recentScores = scoresBetween(0, cfg.windowDays);

  const avgPerformance = average(recentScores);

  const completionRate = calculateCompletionRate(plan, now);

  // Trend: this week's average vs the week before.
  const thisWeek = average(scoresBetween(0, cfg.trendWindowDays));
  const lastWeek = average(
    scoresBetween(cfg.trendWindowDays, cfg.trendWindowDays * 2)
  );

  const trend =
    thisWeek === null || lastWeek === null
      ? null
      : clamp(5 + (thisWeek - lastWeek) * cfg.trendSensitivity);

  const components = {
    avgPerformance: avgPerformance === null ? null : clamp(avgPerformance),
    completionRate: completionRate === null ? null : completionRate * 10,
    trend,
  };

  const { score, usedWeights } = weightedScore(components, cfg.weights);

  return {
    score: round1(score),
    components: {
      avgPerformance: round1(components.avgPerformance),
      completionRate: round1(components.completionRate),
      trend: round1(trend),
    },
    usedWeights,
    details: {
      sessionsInWindow: recentScores.length,
      completionRatePercent:
        completionRate === null ? null : Math.round(completionRate * 100),
    },
  };
}

// =====================================
// READINESS + STATUS
// =====================================

function classify({ readiness, fatigue, recovery, performance }) {
  const cfg = CONFIG.status;

  if (
    fatigue !== null &&
    recovery !== null &&
    fatigue >= cfg.overreachedFatigue &&
    recovery <= cfg.overreachedMaxRecovery
  ) {
    return "overreached";
  }

  if (
    readiness >= cfg.readyMinReadiness &&
    (fatigue ?? 0) < cfg.readyMaxFatigue &&
    (performance ?? 10) >= cfg.readyMinPerformance
  ) {
    return "ready";
  }

  if (readiness >= cfg.normalMinReadiness) return "normal";
  if (readiness >= cfg.tiredMinReadiness) return "tired";

  return "overreached";
}

/**
 * Main entry: full training state with breakdown.
 * options.sync = true -> pull last 7 days from Google first (ignored if
 * Google is not connected).
 */
async function getTrainingState(userId, { now = new Date(), sync = false } = {}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  let syncStatus = "skipped";

  if (sync) {
    try {
      await googleHealthService.syncGoogleHealthData(userId);
      syncStatus = "ok";
    } catch (error) {
      // Not connected / revoked / Google down: continue with stored data.
      syncStatus = error.code || "error";
    }
  }

  const since = new Date(now.getTime() - CONFIG.fatigue.chronicWindowDays * DAY_MS);

  const [sessions, plan, activity] = await Promise.all([
    WorkoutSession.find({
      userId,
      completed: true,
      endTime: { $ne: null, $gte: since, $lte: now },
    })
      .sort({ endTime: -1 })
      .lean(),

    WorkoutPlan.findOne({ userId, isActive: true }).lean(),

    googleHealthService.getActivitySummary(userId, 7),
  ]);

  const fatigue = calculateFatigue({ sessions, activity, now });
  const recovery = calculateRecovery({ sessions, activity, now });
  const performance = calculatePerformance({ sessions, plan, now });

  const readinessCfg = CONFIG.readiness;

  const readinessResult = weightedScore(
    {
      recovery: recovery.score,
      inverseFatigue: fatigue.score === null ? null : 10 - fatigue.score,
      performance: performance.score,
    },
    readinessCfg.weights
  );

  let readiness = readinessResult.score ?? 5;
  // One WorkoutSession = one exercise, so count distinct training days,
  // not records (a single workout with 4 exercises is still 1 day).
  const trainingDays28d = new Set(
    sessions.map((s) => toVNDateString(s.endTime))
  ).size;
  const isColdStart = trainingDays28d < readinessCfg.minTrainingDaysForHistory;

  if (isColdStart) {
    readiness = Math.min(readiness, readinessCfg.coldStartMaxReadiness);
  }

  const status = classify({
    readiness,
    fatigue: fatigue.score,
    recovery: recovery.score,
    performance: performance.score,
  });

  return {
    fatigueScore: fatigue.score ?? 0,
    recoveryScore: recovery.score ?? 5,
    performanceScore: performance.score ?? 5,
    readinessScore: round1(readiness),
    status,
    recommendedIntensity: CONFIG.intensityByStatus[status],
    isColdStart,
    breakdown: {
      fatigue,
      recovery,
      performance,
      readinessWeights: readinessResult.usedWeights,
    },
    dataAvailability: {
      completedExercises28d: sessions.length,
      trainingDays28d,
      healthCoverage7d: activity.coverage,
      healthMetrics: Object.fromEntries(
        Object.entries(activity.metrics).map(([k, v]) => [k, v.daysWithData])
      ),
      googleSync: syncStatus,
    },
  };
}

module.exports = {
  getTrainingState,
  // exported for unit tests / step 8 calibration
  weightedScore,
  calculateFatigue,
  calculateRecovery,
  calculatePerformance,
  classify,
};
