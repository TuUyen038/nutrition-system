/**
 * Step 8: run the adaptive workout logic on fixed user scenarios and
 * print one row per scenario, to check (and tune) the thresholds in
 * config/adaptiveWorkout.config.js.
 *
 * No database: the scenarios are built in memory and go through the
 * same functions as the real API:
 *   trainingState.computeTrainingState  (fatigue / recovery / performance / status)
 *   workoutRecommendation.applyRestDayRules  (rest days when a week is generated)
 *   adaptivePlan.decideAdaptation  (step 6 action for the next workout day)
 *
 * Run from the backend folder:
 *   node scripts/simulate_adaptive_scenarios.js
 *   node scripts/simulate_adaptive_scenarios.js --json   (full breakdown)
 */
const { computeTrainingState } = require("../services/trainingState.service");
const { applyRestDayRules } = require("../services/workoutRecommendation.service");
const { decideAdaptation, getWeekProgress } = require("../services/adaptivePlan.service");
const { toVNDateString } = require("../utils/date");

const DAY_MS = 24 * 60 * 60 * 1000;

// Wednesday evening, Vietnam time. Plans start on Monday (day 1).
const NOW = new Date("2026-11-11T19:00:00+07:00");
const MONDAY = new Date("2026-11-09T00:00:00+07:00");

// =====================================
// BUILDERS
// =====================================

/**
 * One workout = `exercises` sessions (one per exercise, like the app).
 * daysAgo: list of days before NOW the user trained.
 */
function workouts(daysAgo, { exercises = 4, minutes = 10, rpe = 6, performance = 8 } = {}) {
  return daysAgo.flatMap((ago) =>
    Array.from({ length: exercises }, (_, i) => ({
      endTime: new Date(NOW.getTime() - ago * DAY_MS - i * minutes * 60 * 1000),
      durationMinutes: minutes,
      perceivedDifficulty: rpe,
      performanceScore: performance,
      completed: true,
    }))
  );
}

/**
 * Google Health data of the last 7 days. Omitted values stay null.
 * today: overrides for today (e.g. a busy day, a short night).
 */
function activity({ steps = null, activeMinutes = null, sleepMinutes = null, today = {} } = {}) {
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = toVNDateString(new Date(NOW.getTime() - (6 - i) * DAY_MS));
    const isToday = i === 6;

    return {
      date,
      steps: isToday && today.steps !== undefined ? today.steps : steps,
      activeMinutes:
        isToday && today.activeMinutes !== undefined ? today.activeMinutes : activeMinutes,
      sleepMinutes:
        isToday && today.sleepMinutes !== undefined ? today.sleepMinutes : sleepMinutes,
      caloriesBurned: null,
    };
  });

  const metrics = {};

  ["steps", "activeMinutes", "sleepMinutes", "caloriesBurned"].forEach((metric) => {
    const values = daily.map((d) => d[metric]).filter((v) => v !== null);
    metrics[metric] = { daysWithData: values.length };
  });

  const withData = daily.filter((d) => d.steps !== null || d.activeMinutes !== null || d.sleepMinutes !== null);

  return { daily, metrics, coverage: Math.round((withData.length / 7) * 100) / 100 };
}

const NO_GOOGLE = activity();

/**
 * Plan of this week. workoutDays: day numbers; done / skipped: day numbers.
 */
function plan(workoutDays, { done = [], skipped = [] } = {}) {
  return {
    days: Array.from({ length: 7 }, (_, i) => {
      const day = i + 1;
      return {
        day,
        date: new Date(MONDAY.getTime() + i * DAY_MS),
        type: workoutDays.includes(day) ? "workout" : "rest",
        completed: done.includes(day),
        skipped: skipped.includes(day),
      };
    }),
  };
}

// Minutes moved in the last 7 days, like adaptivePlan.getWeeklyActiveMinutes.
function weeklyActiveMinutes(sessions, act) {
  const google = act.daily.map((d) => d.activeMinutes).filter((v) => v !== null);
  const recent = sessions.filter((s) => NOW - s.endTime <= 7 * DAY_MS);

  if (!google.length && !recent.length) return null;

  return Math.round(
    google.reduce((a, b) => a + b, 0) + recent.reduce((a, s) => a + s.durationMinutes, 0)
  );
}

// =====================================
// SCENARIOS
// =====================================

// Usual beginner rhythm: Mon / Wed / Fri, for the last 4 weeks.
const REGULAR_DAYS = [2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26];

const SCENARIOS = [
  {
    id: "new_user",
    title: "User mới, chưa tập, không Google",
    expect: "maintain (moderate), không tăng",
    sessions: [],
    activity: NO_GOOGLE,
    plan: plan([3, 5, 7]),
  },
  {
    id: "regular",
    title: "Tập đều 3 buổi/tuần, ngủ 7.5h",
    expect: "maintain (đã > 300 phút/tuần WHO)",
    sessions: workouts(REGULAR_DAYS, { rpe: 6, performance: 8 }),
    activity: activity({ steps: 8000, activeMinutes: 30, sleepMinutes: 450 }),
    plan: plan([1, 3, 5], { done: [1] }),
  },
  {
    id: "regular_no_google",
    title: "Tập đều, không cấp quyền Google",
    expect: "increase (chỉ thấy phút tập trong app < 300)",
    sessions: workouts(REGULAR_DAYS, { rpe: 6, performance: 8 }),
    activity: NO_GOOGLE,
    plan: plan([1, 3, 5], { done: [1] }),
  },
  {
    id: "strong_low_volume",
    title: "Tập tốt (perf 9, RPE 5), ít vận động ngoài app",
    expect: "increase",
    sessions: workouts(REGULAR_DAYS, { rpe: 5, performance: 9 }),
    activity: activity({ steps: 5000, activeMinutes: 10, sleepMinutes: 480 }),
    plan: plan([1, 3, 5], { done: [1] }),
  },
  {
    id: "busy_day",
    title: "Tập đều, hôm nay đi bộ 90 phút / 15.000 bước",
    expect: "reduce_intensity (ngày bận)",
    sessions: workouts(REGULAR_DAYS, { rpe: 6, performance: 8 }),
    activity: activity({
      steps: 8000,
      activeMinutes: 30,
      sleepMinutes: 450,
      today: { steps: 15000, activeMinutes: 90 },
    }),
    plan: plan([1, 3, 5], { done: [1] }),
  },
  {
    id: "short_night",
    title: "Tập đều, đêm qua ngủ 4h",
    expect: "reduce_intensity (ngủ < 5h)",
    sessions: workouts(REGULAR_DAYS, { rpe: 6, performance: 8 }),
    activity: activity({
      steps: 8000,
      activeMinutes: 30,
      sleepMinutes: 450,
      today: { sleepMinutes: 240 },
    }),
    plan: plan([1, 3, 5], { done: [1] }),
  },
  {
    id: "overload",
    title: "Quá tải: 5 ngày liền 60 phút RPE 9, ngủ 5h",
    expect: "rest (overreached)",
    sessions: [
      ...workouts([9, 12, 16, 19, 23, 26], { minutes: 8, rpe: 5, performance: 7 }),
      ...workouts([0.1, 1, 2, 3, 4], { exercises: 6, minutes: 10, rpe: 9, performance: 6 }),
    ],
    activity: activity({ steps: 12000, activeMinutes: 80, sleepMinutes: 300 }),
    plan: plan([1, 2, 3, 4, 5, 6], { done: [1, 2, 3] }),
  },
  {
    id: "skipping",
    title: "Bỏ 2 buổi tuần này, perf giảm",
    expect: "không tăng, bớt 1 bài",
    sessions: workouts([9, 12, 16, 19, 23], { rpe: 7, performance: 5 }),
    activity: activity({ steps: 4000, activeMinutes: 10, sleepMinutes: 420 }),
    plan: plan([1, 2, 4, 6], { skipped: [1], done: [] }),
  },
];

// =====================================
// RUN
// =====================================

function run(scenario) {
  const state = computeTrainingState({
    sessions: [...scenario.sessions].sort((a, b) => b.endTime - a.endTime),
    plan: scenario.plan,
    activity: scenario.activity,
    now: NOW,
  });

  // Rest-day rules, as if the week were generated now (beginner: 3 days).
  const structure = [1, 3, 5].map((day) => ({ day, type: "workout", focus: "full_body_push" }));
  const restDays = applyRestDayRules(structure, state);

  const today = toVNDateString(NOW);
  const todayRecord = scenario.activity.daily.find((d) => d.date === today) || null;

  const decision = decideAdaptation({
    state,
    todayActivity: todayRecord,
    weeklyActiveMinutes: weeklyActiveMinutes(scenario.sessions, scenario.activity),
    weekProgress: getWeekProgress(scenario.plan, today),
  });

  return { state, restDays, decision };
}

function main() {
  const json = process.argv.includes("--json");
  const rows = [];

  SCENARIOS.forEach((scenario) => {
    const { state, restDays, decision } = run(scenario);

    if (json) {
      console.log(
        JSON.stringify(
          { id: scenario.id, title: scenario.title, state, restDays, decision },
          null,
          2
        )
      );
      return;
    }

    rows.push({
      scenario: scenario.id,
      F: state.fatigueScore,
      R: state.recoveryScore,
      P: state.performanceScore,
      Ready: state.readinessScore,
      status: state.status,
      cold: state.isColdStart ? "yes" : "",
      restWhenGenerated: restDays.days.join(",") || "-",
      action: decision.action + (decision.lowAdherence ? " (-1 bài)" : ""),
      expected: scenario.expect,
    });
  });

  if (json) return;

  console.table(rows);

  SCENARIOS.forEach((scenario) => {
    const { decision } = run(scenario);
    console.log(`\n${scenario.id}: ${scenario.title}\n  -> ${decision.reasons.join(" | ")}`);
  });
}

main();
