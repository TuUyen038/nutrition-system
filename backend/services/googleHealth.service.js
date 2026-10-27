const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const GoogleHealthData = require("../models/GoogleHealthData");
const googleConnectionService = require("./googleConnection.service");
const googleOAuthService = require("./googleOAuth.service");
const googleHealthApi = require("./googleHealthApi.client");

// Needed so dayjs(value, "YYYY-MM-DD", true) really checks the format.
dayjs.extend(customParseFormat);

const MAX_SYNC_DAYS = 90;

// Metric name -> function that fetches it from Google.
const METRIC_FETCHERS = {
  steps: googleHealthApi.fetchDailySteps,
  caloriesBurned: googleHealthApi.fetchDailyActiveCalories,
  activeMinutes: googleHealthApi.fetchDailyActiveMinutes,
  sleep: googleHealthApi.fetchDailySleep,
  exercise: googleHealthApi.fetchDailyExercise,
};

const ACTIVITY_METRICS = [
  "steps",
  "caloriesBurned",
  "activeMinutes",
  "sleepMinutes",
];

function normalizeDate(date) {
  const value = date || dayjs().format("YYYY-MM-DD");

  if (!dayjs(value, "YYYY-MM-DD", true).isValid()) {
    throw new Error("date must use YYYY-MM-DD format");
  }

  return value;
}

function toNonNegativeNumber(value, fieldName) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }

  return number;
}

/**
 * Missing value -> null (no data), not 0.
 * 0 steps and "Google did not return steps" mean different things.
 */
function toOptionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return toNonNegativeNumber(value, fieldName);
}

function normalizeSleep(sleep = {}) {
  const durationMinutes = toOptionalNonNegativeNumber(
    sleep.durationMinutes,
    "sleep.durationMinutes"
  );

  let startTime = null;
  let endTime = null;

  if (sleep.startTime) {
    const parsed = new Date(sleep.startTime);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("sleep.startTime is not a valid date");
    }
    startTime = parsed;
  }

  if (sleep.endTime) {
    const parsed = new Date(sleep.endTime);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("sleep.endTime is not a valid date");
    }
    endTime = parsed;
  }

  return {
    durationMinutes,
    startTime,
    endTime,
  };
}

/**
 * Normalize data that later can be replaced by real Google Health/Fit data.
 */
function normalizeHealthPayload(payload = {}) {
  return {
    date: normalizeDate(payload.date),
    steps: toOptionalNonNegativeNumber(payload.steps, "steps"),
    caloriesBurned: toOptionalNonNegativeNumber(
      payload.caloriesBurned,
      "caloriesBurned"
    ),
    activeMinutes: toOptionalNonNegativeNumber(
      payload.activeMinutes,
      "activeMinutes"
    ),
    sleep: normalizeSleep(payload.sleep),
  };
}

/**
 * Build $set from normalized data, skipping null fields.
 * A metric that is missing in this sync keeps its previously saved value.
 */
function buildHealthUpdate(normalized, source) {
  const update = {
    source,
    syncedAt: new Date(),
  };

  ["steps", "caloriesBurned", "activeMinutes"].forEach((field) => {
    if (normalized[field] !== null) {
      update[field] = normalized[field];
    }
  });

  Object.entries(normalized.sleep).forEach(([field, value]) => {
    if (value !== null) {
      update[`sleep.${field}`] = value;
    }
  });

  return update;
}

function buildDefaultMockData() {
  return {
    date: dayjs().format("YYYY-MM-DD"),
    steps: 8234,
    caloriesBurned: 612.45,
    activeMinutes: 74,
    sleep: {
      durationMinutes: 432,
      startTime: `${dayjs().subtract(1, "day").format("YYYY-MM-DD")}T23:18:00.000Z`,
      endTime: `${dayjs().format("YYYY-MM-DD")}T06:30:00.000Z`,
    },
  };
}

/**
 * Milestone 1:
 * Simulates the data that will later come from Google Health/Fit,
 * then stores it in MongoDB.
 */
async function syncMockHealthData(userId, payload = {}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const input = Object.keys(payload).length
    ? payload
    : buildDefaultMockData();

  const normalized = normalizeHealthPayload(input);

  console.log("\n=============================================");
  console.log("[Google Health] START MOCK SYNC");
  console.log("=============================================");
  console.log(`[Google Health] User ID       : ${userId}`);
  console.log(`[Google Health] Date          : ${normalized.date}`);
  console.log(`[Google Health] Steps         : ${normalized.steps}`);
  console.log(
    `[Google Health] Calories      : ${normalized.caloriesBurned} kcal`
  );
  console.log(
    `[Google Health] Active minutes: ${normalized.activeMinutes} minutes`
  );
  console.log(
    `[Google Health] Sleep         : ${normalized.sleep.durationMinutes ?? "no data"} minutes`
  );
  console.log("[Google Health] Source        : google_health_mock");
  console.log("[Google Health] Saving MongoDB...");

  const saved = await GoogleHealthData.findOneAndUpdate(
    {
      userId,
      date: normalized.date,
    },
    {
      $set: buildHealthUpdate(normalized, "google_health_mock"),
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  console.log("[Google Health] MongoDB       : UPSERT SUCCESS");
  console.log(
    `[Google Health] MongoDB ID    : ${saved._id.toString()}`
  );
  console.log("=============================================");
  console.log("[Google Health] MOCK SYNC COMPLETED");
  console.log("=============================================\n");

  return saved;
}

async function getHealthDataByDate(userId, date) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const normalizedDate = normalizeDate(date);

  return GoogleHealthData.findOne({
    userId,
    date: normalizedDate,
  }).lean();
}

async function getHealthData(userId, from, to) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const query = { userId };

  if (from || to) {
    query.date = {};

    if (from) {
      query.date.$gte = normalizeDate(from);
    }

    if (to) {
      query.date.$lte = normalizeDate(to);
    }
  }

  return GoogleHealthData.find(query)
    .sort({ date: -1 })
    .lean();
}

/**
 * Classify a failed Google call so the caller knows what happened
 * to that one metric.
 */
function describeMetricError(error) {
  const status = error.response?.status || error.code;

  if (status === 403) return "no_permission";
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";

  return "error";
}

function listDates(from, to) {
  const dates = [];
  let current = dayjs(from);
  const last = dayjs(to);

  while (!current.isAfter(last)) {
    dates.push(current.format("YYYY-MM-DD"));
    current = current.add(1, "day");
  }

  return dates;
}

/**
 * Pull real data from Google Health API for [from, to] and upsert it.
 *
 * - Only metrics the user granted are requested.
 * - Each metric is fetched separately: one failing metric does not stop the others.
 * - Days/metrics without data stay null (existing values are not overwritten).
 */
async function syncGoogleHealthData(userId, { from, to, debug = false } = {}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const toDate = normalizeDate(to);
  const fromDate = from
    ? normalizeDate(from)
    : dayjs(toDate).subtract(6, "day").format("YYYY-MM-DD");

  if (dayjs(fromDate).isAfter(dayjs(toDate))) {
    throw new Error("from must be before or equal to to");
  }

  if (dayjs(toDate).diff(dayjs(fromDate), "day") + 1 > MAX_SYNC_DAYS) {
    throw new Error(`Sync range must be at most ${MAX_SYNC_DAYS} days`);
  }

  // Throws GOOGLE_NOT_CONNECTED / GOOGLE_TOKEN_REVOKED.
  const { client, scopes } =
    await googleConnectionService.getAuthorizedClient(userId);

  const grantedMetrics = googleOAuthService.getGrantedMetrics(scopes);

  const metricStatus = {};
  const metricValues = {};
  // Raw Google responses, only filled when debug = true.
  const debugLog = debug ? [] : null;

  for (const [metric, fetcher] of Object.entries(METRIC_FETCHERS)) {
    if (!grantedMetrics.includes(metric)) {
      metricStatus[metric] = "not_granted";
      continue;
    }

    try {
      metricValues[metric] = await fetcher(client, fromDate, toDate, debugLog);
      metricStatus[metric] = "ok";
    } catch (error) {
      metricStatus[metric] = describeMetricError(error);
      console.error(
        `[Google Health] Sync ${metric} failed (${metricStatus[metric]}):`,
        error.response?.data?.error?.message || error.message
      );
    }
  }

  const syncedDates = [];

  for (const date of listDates(fromDate, toDate)) {
    const sleep = metricValues.sleep?.[date];
    const exercise = metricValues.exercise?.[date];

    const normalized = normalizeHealthPayload({
      date,
      steps: metricValues.steps?.[date],
      // Daily rollup first (covers the whole day). If the day has no
      // rollup (e.g. only manually logged workouts), fall back to the
      // sum of exercise sessions.
      caloriesBurned:
        metricValues.caloriesBurned?.[date] ?? exercise?.caloriesBurned,
      activeMinutes:
        metricValues.activeMinutes?.[date] ?? exercise?.activeMinutes,
      sleep: sleep || {},
    });

    const hasAnyValue =
      normalized.steps !== null ||
      normalized.caloriesBurned !== null ||
      normalized.activeMinutes !== null ||
      normalized.sleep.durationMinutes !== null;

    // No data at all for this day: do not create an empty document.
    if (!hasAnyValue) continue;

    await GoogleHealthData.findOneAndUpdate(
      { userId, date },
      { $set: buildHealthUpdate(normalized, "google_health") },
      {
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    syncedDates.push(date);
  }

  await googleConnectionService.markSynced(userId);

  console.log(
    `[Google Health] Synced ${syncedDates.length} day(s) for user ${userId}`,
    metricStatus
  );

  return {
    from: fromDate,
    to: toDate,
    metrics: metricStatus,
    syncedDays: syncedDates.length,
    syncedDates,
    ...(debug && { debug: debugLog }),
  };
}

/**
 * One stored document -> flat daily activity used by the workout logic.
 * Every metric is a number or null.
 */
function toDailyActivity(doc) {
  return {
    date: doc.date,
    steps: doc.steps ?? null,
    caloriesBurned: doc.caloriesBurned ?? null,
    activeMinutes: doc.activeMinutes ?? null,
    sleepMinutes: doc.sleep?.durationMinutes ?? null,
    source: doc.source,
  };
}

function average(values) {
  if (!values.length) return null;

  const sum = values.reduce((total, value) => total + value, 0);

  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Summary of the last `days` days (today included).
 * Averages only use days that have the metric, so missing data
 * does not drag the average down.
 */
async function getActivitySummary(userId, days = 7) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const totalDays = Number(days);

  if (!Number.isInteger(totalDays) || totalDays < 1 || totalDays > 90) {
    throw new Error("days must be an integer between 1 and 90");
  }

  const to = dayjs().format("YYYY-MM-DD");
  const from = dayjs()
    .subtract(totalDays - 1, "day")
    .format("YYYY-MM-DD");

  const docs = await getHealthData(userId, from, to);
  const daily = docs.map(toDailyActivity);

  const metrics = {};

  ACTIVITY_METRICS.forEach((metric) => {
    const values = daily
      .map((day) => day[metric])
      .filter((value) => value !== null);

    metrics[metric] = {
      avg: average(values),
      daysWithData: values.length,
    };
  });

  const daysWithAnyData = daily.filter((day) =>
    ACTIVITY_METRICS.some((metric) => day[metric] !== null)
  ).length;

  return {
    from,
    to,
    days: totalDays,
    metrics,
    coverage: Math.round((daysWithAnyData / totalDays) * 100) / 100,
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

module.exports = {
  syncGoogleHealthData,
  syncMockHealthData,
  getActivitySummary,
  toDailyActivity,
  getHealthDataByDate,
  getHealthData,
  normalizeHealthPayload,
};
