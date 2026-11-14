/**
 * All weights and thresholds of the adaptive workout system in one place.
 * Tune these during testing without touching the logic.
 * Every score is on a 0-10 scale.
 */
module.exports = {
  trainingState: {
    // ---------- Fatigue ----------
    fatigue: {
      // A session's load = durationMinutes x perceivedDifficulty (session-RPE).
      // Its effect halves every `loadHalfLifeDays` days.
      loadHalfLifeDays: 2,
      acuteWindowDays: 7,
      chronicWindowDays: 28,
      // Acute:chronic workload ratio (ACWR). 1.0 = training as usual,
      // > 1.5 is the well-known "danger zone". This ratio maps to fatigue 10.
      overloadRatio: 1.75,
      // Weekly load used as "usual" when the user has little or no history
      // (~3 moderate 30-min sessions), so a beginner is not compared to 0.
      minReferenceLoad: 500,
      // Active minutes per day (outside the app) that maps to fatigue 5/10.
      referenceActiveMinutesPerDay: 60,
      activityWindowDays: 2,
      weights: {
        training: 0.75,
        dailyActivity: 0.25,
      },
    },

    // ---------- Recovery ----------
    recovery: {
      sleepMinMinutes: 240, // 4h or less -> 0
      sleepGoodMinutes: 480, // 8h or more -> 10
      hardSessionRpe: 7, // RPE >= 7 counts as a hard session
      fullRecoveryHours: 48, // 48h after a hard session -> 10
      restDaysForFullScore: 3, // 3+ rest days in last 7 -> 10
      weights: {
        sleep: 0.4,
        timeSinceHardSession: 0.35,
        restDays: 0.25,
      },
    },

    // ---------- Performance ----------
    performance: {
      windowDays: 14,
      trendWindowDays: 7,
      // +1 point of avg performanceScore between two weeks -> +2.5 trend score
      trendSensitivity: 2.5,
      weights: {
        avgPerformance: 0.5,
        completionRate: 0.3,
        trend: 0.2,
      },
    },

    // ---------- Readiness (combined) ----------
    readiness: {
      weights: {
        recovery: 0.4,
        inverseFatigue: 0.35,
        performance: 0.25,
      },
      // Fewer training days (last 28 days) than this -> readiness capped,
      // so a brand-new user is never pushed to vigorous.
      minTrainingDaysForHistory: 3,
      coldStartMaxReadiness: 6.5,
    },

    // ---------- Classification ----------
    status: {
      readyMinReadiness: 7.5,
      readyMaxFatigue: 6,
      // Skipping many sessions / declining scores -> never escalate.
      readyMinPerformance: 5,
      normalMinReadiness: 5.5,
      tiredMinReadiness: 3.5,
      // Very high fatigue with low recovery is overreached whatever readiness says.
      overreachedFatigue: 8.5,
      overreachedMaxRecovery: 4,
    },

    intensityByStatus: {
      ready: "vigorous",
      normal: "moderate",
      tired: "light",
      overreached: "light",
    },
  },

  exerciseScoring: {
    // How many exercises of the focus are loaded before scoring.
    candidatePoolSize: 150,

    // Each component is 0-1. Missing components are skipped and the
    // remaining weights re-normalized (same rule as trainingState).
    weights: {
      muscleMatch: 0.25,
      goalMatch: 0.15,
      levelMatch: 0.15,
      history: 0.15,
      recency: 0.15,
      stateFit: 0.15,
    },

    // levelMatch by (exercise level - user level).
    levelMatchByGap: {
      "-2": 0.4,
      "-1": 0.7,
      0: 1,
      1: 0.5, // one level above: allowed, but less likely
    },
    // More than this many levels above the user -> excluded.
    maxLevelsAboveUser: 1,

    // Used when Exercise.suitableGoals is empty (currently true for
    // the whole DB): goal fit guessed from exerciseType.
    goalFitByExerciseType: {
      lose_weight: { cardio: 1, compound: 0.9, isolation: 0.5, mobility: 0.3, stretching: 0.2 },
      maintain_weight: { compound: 0.8, isolation: 0.7, cardio: 0.7, mobility: 0.6, stretching: 0.5 },
      gain_weight: { compound: 1, isolation: 0.8, cardio: 0.3, mobility: 0.3, stretching: 0.2 },
    },
    // suitableGoals is filled but does not contain the user's goal.
    goalMismatchScore: 0.2,

    // recency by days since the user last did the exercise.
    recency: [
      { maxDays: 1, score: 0 },
      { maxDays: 3, score: 0.3 },
      { maxDays: 7, score: 0.7 },
    ],
    // Exercise used on the previous workout day of the plan being generated.
    previousDayScore: 0.3,

    // stateFit: exercise fatigueScore (1-10) vs readiness (0-10).
    // Heavier than readiness is penalized twice as hard as lighter.
    stateFitHeavierRange: 5,
    stateFitLighterRange: 10,

    // High-impact exercises are excluded in these statuses.
    noHighImpactStatuses: ["tired", "overreached"],

    // Score lost for each primary muscle already trained by an exercise
    // picked earlier the same day.
    diversityPenalty: 0.1,

    // Equipment that never needs to be owned.
    alwaysAvailableEquipment: ["none (bodyweight exercise)", "gym mat"],

    // Feedback from replacing an exercise (step 7).
    feedback: {
      // reason "pain": the exercise is not suggested again for N days.
      painExcludeDays: 28,
      // reason "dislike": score lowered for N days (still allowed).
      dislikeDays: 56,
      dislikePenalty: 0.2,
    },
  },

  // ---------- Step 6: adapting the current week ----------
  adaptivePlan: {
    // Rules are checked in this order; the first that matches wins.
    // overreached -> rest, tired -> light_session (see decideAdaptation).
    reduceWhenFatigueAtLeast: 7,
    reduceWhenRecoveryAtMost: 4,

    // A lot of activity outside the app today (Google Health) -> reduce.
    busyDayActiveMinutes: 60,
    busyDaySteps: 12000,

    // Last night shorter than this (Google Health) -> reduce. One short
    // night barely moves Recovery (sleep is 40% of it) but already
    // lowers strength and raises perceived effort the next day.
    shortSleepMinutes: 300,

    // WHO 2020 guideline for adults: 150-300 min/week of moderate activity
    // (single source: config/whoGuidelines.config.js). Compared with the
    // WHO-style weekly minutes (moderate + 2 x vigorous, light minutes not
    // counted) from activityGuideline.rules.weeklyWhoMinutes, the same number
    // the WHO comparison screen shows. Below the maximum + ready -> increase.
    whoWeeklyMinutes: {
      min: require("./whoGuidelines.config").groups.adult.aerobic.min,
      max: require("./whoGuidelines.config").groups.adult.aerobic.max,
    },
    increaseMinPerformance: 7,

    // Skipped workout days this week before volume is lowered.
    lowAdherenceSkips: 2,

    // What each action changes, always computed from the original day
    // (so running the adaptation twice never stacks).
    actions: {
      increase: { intensityStep: 1, exerciseDelta: 0, setsDelta: 0 },
      maintain: { intensityStep: 0, exerciseDelta: 0, setsDelta: 0 },
      reduce_intensity: { intensityStep: -1, exerciseDelta: 0, setsDelta: 0 },
      light_session: { intensity: "light", exerciseDelta: -1, setsDelta: -1, swapToLight: true },
      rest: { toRest: true },
    },
    lowAdherence: { exerciseDelta: -1 },

    minExercises: 2,
    minSets: 2,

    // rest / light_session only touch the next workout day; the
    // following days get the milder action, then are re-checked daily.
    followUpAction: {
      rest: "reduce_intensity",
      light_session: "reduce_intensity",
    },

    maxHistory: 30,
  },

  // ---------- Plan generation (week structure) ----------
  // Generation builds the "base" week (level + goal only). The user's
  // state is applied once, right after, by adaptivePlan (step 6), so the
  // two never stack. Only how many days the user trains this week is
  // decided here.
  planGeneration: {
    baseIntensity: "moderate",
    baseDifficulty: 6,

    // Turn a workout day into rest for the whole week.
    // pick: "first" = the first workout day (right away),
    //       "last"  = the last workout day (lowers weekly volume).
    restDayRules: [
      { metric: "recoveryScore", atMost: 3, pick: "first", label: "Recovery" },
      { metric: "fatigueScore", atLeast: 8, pick: "last", label: "Fatigue" },
    ],
    // Never go below this many workout days in a week.
    minWorkoutDays: 2,
  },

  // ---------- Step 7: exercise substitution ----------
  exerciseSubstitution: {
    defaultLimit: 5,
    maxLimit: 20,

    // final = ranking (step 5 score) x w + similarity x w
    weights: { ranking: 0.5, similarity: 0.5 },

    similarity: {
      weights: { muscle: 0.5, difficulty: 0.25, calories: 0.25 },
      // |calories - original| / original: within this -> 1,
      // falls linearly to 0 at caloriesZeroAt.
      caloriesTolerance: 0.2,
      caloriesZeroAt: 0.6,
    },

    // Why the user wants to change: narrows the alternatives.
    reasons: {
      too_hard: { maxDifficultyGap: 0, maxFatigueGap: 0 },
      no_equipment: { bodyweightOnly: true },
      pain: { impactLevels: ["low"] },
      dislike: {},
      other: {},
    },
  },
};
