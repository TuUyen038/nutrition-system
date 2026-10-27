const dayjs = require("dayjs");

/**
 * Thin client for Google Health API v4.
 * Docs: https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
 *
 * Every function returns a map { "YYYY-MM-DD": number } and only contains
 * days that Google actually has data for. Missing day = no data (null later).
 */

const BASE_URL = "https://health.googleapis.com/v4/users/me/dataTypes";

// dailyRollUp allows max 14 days for active-minutes and total-calories,
// so every rollup request is split into chunks of this size.
const MAX_ROLLUP_DAYS = 14;

// list() page size limit for sleep.
const SLEEP_PAGE_SIZE = 25;

function toCivilDateTime(dateString) {
  const d = dayjs(dateString);

  return {
    date: { year: d.year(), month: d.month() + 1, day: d.date() },
    time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

function civilDateToString(civil) {
  const { year, month, day } = civil.date;

  return dayjs(new Date(year, month - 1, day)).format("YYYY-MM-DD");
}

// Google returns int64 as string ("3822"), kcal as number.
function toNumber(value) {
  if (value === undefined || value === null) return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

/**
 * [from, to] inclusive -> chunks of at most MAX_ROLLUP_DAYS days.
 */
function splitIntoChunks(from, to) {
  const chunks = [];
  let start = dayjs(from);
  const last = dayjs(to);

  while (!start.isAfter(last)) {
    let end = start.add(MAX_ROLLUP_DAYS - 1, "day");

    if (end.isAfter(last)) end = last;

    chunks.push({
      from: start.format("YYYY-MM-DD"),
      to: end.format("YYYY-MM-DD"),
    });

    start = end.add(1, "day");
  }

  return chunks;
}

/**
 * debugLog (optional array): when given, every raw request/response is
 * pushed into it so we can see exactly what Google returned.
 */
function pushDebug(debugLog, entry) {
  if (Array.isArray(debugLog)) {
    debugLog.push(entry);
  }
}

/**
 * POST .../{dataType}/dataPoints:dailyRollUp, one point per day.
 * `pickValue(point)` extracts the number for that data type.
 */
async function dailyRollUp(client, dataType, from, to, pickValue, debugLog) {
  const result = {};

  for (const chunk of splitIntoChunks(from, to)) {
    const body = {
      range: {
        start: toCivilDateTime(chunk.from),
        // end is exclusive -> midnight of the day after `to`
        end: toCivilDateTime(dayjs(chunk.to).add(1, "day").format("YYYY-MM-DD")),
      },
      windowSizeDays: 1,
    };

    const response = await client.request({
      url: `${BASE_URL}/${dataType}/dataPoints:dailyRollUp`,
      method: "POST",
      data: body,
    });

    pushDebug(debugLog, {
      dataType,
      request: body,
      status: response.status,
      response: response.data,
    });

    const points = response.data?.rollupDataPoints || [];

    points.forEach((point) => {
      const value = pickValue(point);

      if (value !== null) {
        result[civilDateToString(point.civilStartTime)] = value;
      }
    });
  }

  return result;
}

function fetchDailySteps(client, from, to, debugLog) {
  return dailyRollUp(client, "steps", from, to, (point) =>
    toNumber(point.steps?.countSum)
  , debugLog);
}

/**
 * Active energy (exercise + movement), not total calories.
 * Total calories includes BMR (~1500 kcal/day even when lying in bed),
 * which would hide how active the user really was.
 */
function fetchDailyActiveCalories(client, from, to, debugLog) {
  return dailyRollUp(client, "active-energy-burned", from, to, (point) => {
    const kcal = toNumber(point.activeEnergyBurned?.kcalSum);

    return kcal === null ? null : Math.round(kcal);
  }, debugLog);
}

/**
 * Sum of all activity levels returned by Google.
 */
function fetchDailyActiveMinutes(client, from, to, debugLog) {
  return dailyRollUp(client, "active-minutes", from, to, (point) => {
    const levels = point.activeMinutes?.activeMinutesRollupByActivityLevel;

    if (!levels) return null;

    return levels.reduce(
      (sum, level) => sum + (toNumber(level.activeMinutesSum) || 0),
      0
    );
  }, debugLog);
}

/**
 * Sleep is a session type: no dailyRollUp, use list() with a filter.
 * A sleep belongs to the day it ENDS (night of 25 -> morning of 26 = day 26),
 * which is "last night's sleep" for that day's training decision.
 * Returns { "YYYY-MM-DD": { durationMinutes, startTime, endTime } }.
 */
async function fetchDailySleep(client, from, to, debugLog) {
  const result = {};
  const endExclusive = dayjs(to).add(1, "day").format("YYYY-MM-DD");
  const filter =
    `sleep.interval.civil_end_time >= "${from}" AND ` +
    `sleep.interval.civil_end_time < "${endExclusive}"`;

  let pageToken;

  do {
    const response = await client.request({
      url: `${BASE_URL}/sleep/dataPoints`,
      method: "GET",
      params: {
        filter,
        pageSize: SLEEP_PAGE_SIZE,
        pageToken,
      },
    });

    pushDebug(debugLog, {
      dataType: "sleep",
      request: { filter, pageToken: pageToken || null },
      status: response.status,
      response: response.data,
    });

    const points = response.data?.dataPoints || [];

    points.forEach((point) => {
      const sleep = point.sleep;
      const minutes = toNumber(sleep?.summary?.minutesAsleep);

      if (!sleep?.interval?.civilEndTime || minutes === null) return;

      const date = civilDateToString(sleep.interval.civilEndTime);
      const current = result[date];

      // Several sessions in one day (night + nap): add minutes up,
      // keep the earliest start and the latest end.
      if (!current) {
        result[date] = {
          durationMinutes: minutes,
          startTime: sleep.interval.startTime,
          endTime: sleep.interval.endTime,
        };
      } else {
        current.durationMinutes += minutes;
        if (sleep.interval.startTime < current.startTime) {
          current.startTime = sleep.interval.startTime;
        }
        if (sleep.interval.endTime > current.endTime) {
          current.endTime = sleep.interval.endTime;
        }
      }
    });

    pageToken = response.data?.nextPageToken || undefined;
  } while (pageToken);

  return result;
}

/**
 * "1800s" -> 30 (minutes).
 */
function durationToMinutes(duration) {
  const seconds = toNumber(String(duration || "").replace("s", ""));

  return seconds === null ? null : Math.round(seconds / 60);
}

/**
 * startTime is UTC, startUtcOffset is the user's offset ("25200s" = +7h).
 * Adding them gives the user's local date, so a walk at 00:30 VN time
 * counts for that VN day, not the previous UTC day.
 */
function toLocalDate(utcTime, utcOffset) {
  const offsetSeconds = toNumber(String(utcOffset || "0s").replace("s", "")) || 0;
  const local = new Date(Date.parse(utcTime) + offsetSeconds * 1000);

  return local.toISOString().slice(0, 10);
}

/**
 * Exercise sessions (walks, runs, workouts the user logged or a watch detected).
 * Session type: list() with a civil_start_time filter, max 25 per page.
 * Returns { "YYYY-MM-DD": { activeMinutes, caloriesBurned, sessions } }.
 */
async function fetchDailyExercise(client, from, to, debugLog) {
  const result = {};
  const endExclusive = dayjs(to).add(1, "day").format("YYYY-MM-DD");
  const filter =
    `exercise.interval.civil_start_time >= "${from}" AND ` +
    `exercise.interval.civil_start_time < "${endExclusive}"`;

  let pageToken;

  do {
    const response = await client.request({
      url: `${BASE_URL}/exercise/dataPoints`,
      method: "GET",
      params: { filter, pageSize: SLEEP_PAGE_SIZE, pageToken },
    });

    pushDebug(debugLog, {
      dataType: "exercise",
      request: { filter, pageToken: pageToken || null },
      status: response.status,
      response: response.data,
    });

    (response.data?.dataPoints || []).forEach((point) => {
      const exercise = point.exercise;

      if (!exercise?.interval?.startTime) return;

      const date = toLocalDate(
        exercise.interval.startTime,
        exercise.interval.startUtcOffset
      );

      const day = result[date] || {
        activeMinutes: 0,
        caloriesBurned: 0,
        sessions: 0,
      };

      day.activeMinutes += durationToMinutes(exercise.activeDuration) || 0;
      day.caloriesBurned += toNumber(exercise.metricsSummary?.caloriesKcal) || 0;
      day.sessions += 1;

      result[date] = day;
    });

    pageToken = response.data?.nextPageToken || undefined;
  } while (pageToken);

  return result;
}

module.exports = {
  fetchDailyExercise,
  fetchDailySteps,
  fetchDailyActiveCalories,
  fetchDailyActiveMinutes,
  fetchDailySleep,
  splitIntoChunks,
};
