const WorkoutSession = require("../models/WorkoutSession");
const WorkoutPlan = require("../models/WorkoutPlan");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const ActivityMet = require("../models/ActivityMet");
const UserExerciseStats = require("../models/UserExerciseStats");
const { toVNDateString } = require("../utils/date");

function calculatePerformanceScore({
  completedSets,
  targetSets,
  perceivedDifficulty,
}) {
  // No target (old data) -> did something = full, nothing = 0.
  const ratio = targetSets > 0
    ? completedSets / targetSets
    : completedSets > 0 ? 1 : 0;

  let score = ratio * 10;

  if (perceivedDifficulty >= 8) {
    score -= 2;
  }

  return Math.max(
    1,
    Math.min(10, Math.round(score))
  );
}

function calculateFatigue({
  intensity,
  duration,
  perceivedDifficulty,
}) {
  let fatigue = 0;

  if (intensity === "vigorous") {
    fatigue += 3;
  }

  if (intensity === "moderate") {
    fatigue += 2;
  }

  fatigue += duration / 20;

  fatigue += perceivedDifficulty / 2;

  return Math.min(10, Math.round(fatigue));
}

async function updateExerciseStats({
  userId,
  exerciseId,
  performanceScore,
  perceivedDifficulty,
}) {
  let stats =
    await UserExerciseStats.findOne({
      userId,
      exerciseId,
    });

  if (!stats) {
    stats = new UserExerciseStats({
      userId,
      exerciseId,
    });
  }

  stats.totalSessions += 1;

  stats.completedSessions += 1;

  // Performance score được cập nhật theo trung bình cộng
  stats.totalPerformanceScore += performanceScore;

  stats.avgPerformanceScore = stats.totalPerformanceScore / stats.completedSessions;

  // Độ khó trung bình được cập nhật theo trung bình cộng
  stats.totalDifficulty += perceivedDifficulty;
  
  stats.avgDifficulty = stats.totalDifficulty / stats.completedSessions;

  // Preference score có thể được tính dựa trên hiệu suất và độ khó
  stats.preferenceScore = (stats.avgPerformanceScore * 0.7) +
  ((10 - stats.avgDifficulty) * 0.3);

  stats.lastPerformedAt = new Date();

  await stats.save();
}

async function getWorkoutHistory(userId, options = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "endTime",
    } = options;

    const skip = (Number(page) - 1) * Number(limit);

    const filter = {
      userId,
      completed: true,
      endTime: { $ne: null },
    };

    const [sessions, total] = await Promise.all([
      WorkoutSession.find(filter)
        .sort({ [sortBy]: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),

      WorkoutSession.countDocuments(filter),
    ]);

    return {
      sessions: sessions.map((session) => ({
        _id: session._id,
        planId: session.planId,
        day: session.day,
        focus: session.focus,

        exerciseId: session.exerciseId,
        exerciseName: session.exerciseName,
        intensity: session.intensity,
        muscleGroups: session.muscleGroups || [],

        targetSets: session.targetSets,
        targetReps: session.targetReps,
        completedSets: session.completedSets,
        completedReps: session.completedReps,

        durationMinutes: session.durationMinutes,
        estimatedCalories: session.estimatedCalories,
        actualCalories: session.actualCalories,

        perceivedDifficulty: session.perceivedDifficulty,
        performanceScore: session.performanceScore,
        fatigueImpact: session.fatigueImpact,

        startTime: session.startTime,
        endTime: session.endTime,
        createdAt: session.createdAt,
      })),

      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  } catch (err) {
    console.error("[getWorkoutHistory] Error:", err);
    throw err;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// A session left open longer than this (app closed, phone died...) is
// closed as abandoned instead of blocking every later workout.
const STALE_SESSION_HOURS = 3;

// Same default as workoutRecommendation.calculateCalories.
const DEFAULT_MET = 5;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getMet(activityType, intensity) {
  try {
    const metData = await ActivityMet.findOne({ activityType }).lean();

    return metData?.mets?.[intensity] || DEFAULT_MET;
  } catch (err) {
    return DEFAULT_MET;
  }
}

async function closeStaleSessions(userId, now) {
  await WorkoutSession.updateMany(
    {
      userId,
      endTime: null,
      startTime: { $lt: new Date(now.getTime() - STALE_SESSION_HOURS * 60 * 60 * 1000) },
    },
    [
      {
        $set: {
          endTime: "$startTime",
          completed: false,
          skipped: true,
          userFeedback: "auto-closed: abandoned session",
        },
      },
    ]
  );
}

/**
 * userId always comes from the token (req.user), never from the body:
 * the plan must belong to that user.
 */
async function startWorkout({
  userId,
  planId,
  day,
  exerciseId,
}) {
  const now = new Date();
  const dayNumber = Number(day);
  const exerciseNumber = Number(exerciseId);

  await closeStaleSessions(userId, now);

  const active =
    await WorkoutSession.findOne({
      userId,
      endTime: null,
    });

  if (active) {
    throw httpError(409, "Workout session already active");
  }

  const plan =
    await WorkoutPlan.findOne({ _id: planId, userId });

  if (!plan) {
    throw httpError(404, "Plan not found");
  }

  const dayData = plan.days.find(
    (d) => d.day === dayNumber
  );

  if (!dayData) {
    throw httpError(404, `Day ${dayNumber} not found`);
  }

  if (dayData.type !== "workout") {
    throw httpError(400, "Ngày này là ngày nghỉ");
  }

  if (dayData.completed || dayData.skipped) {
    throw httpError(400, "Ngày này đã hoàn thành hoặc đã bỏ qua");
  }

  const exerciseData =
    dayData.exerciseDetails.find(
      (e) => e.exerciseId === exerciseNumber
    );

  if (!exerciseData) {
    throw httpError(404, `Exercise ${exerciseNumber} is not in day ${dayNumber}`);
  }

  const exercise =
    await Exercise.findOne({
      exerciseId: exerciseNumber,
    }).lean();

  const session = new WorkoutSession({
    userId,

    planId: plan._id,

    day: dayNumber,

    focus: dayData.focus,

    exerciseId: exerciseNumber,

    exerciseName:
      exerciseData.name,

    intensity:
      exerciseData.intensity || "moderate",

    targetSets:
      exerciseData.sets || 0,

    targetReps:
      exerciseData.reps || "",

    estimatedCalories:
      exerciseData.calories || 0,

    muscleGroups:
      exercise?.muscles?.map(
        (m) => m.name_en || m.name
      ) || [],

    startTime: now,
  });

  await session.save();

  return session;
}

async function stopWorkout({
  userId,
  sessionId,
  completedSets,
  completedReps,
  perceivedDifficulty,
}) {
  const session =
    await WorkoutSession.findOne({
      _id: sessionId,
      userId,
    });

  if (!session || session.endTime) {
    throw httpError(400, "Session invalid");
  }

  const sets = Math.max(0, Number(completedSets) || 0);
  const reps = Math.max(0, Number(completedReps) || 0);
  const rpe = Number(perceivedDifficulty);

  if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
    throw httpError(400, "perceivedDifficulty must be between 1 and 10");
  }

  const endTime = new Date();

  const durationMinutes =
    (endTime - session.startTime) /
    1000 /
    60;

  const user = await User.findById(
    session.userId
  ).lean();

  const exercise =
    await Exercise.findOne({
      exerciseId:
        session.exerciseId,
    }).lean();

  const met = await getMet(
    exercise?.activityType,
    session.intensity
  );

  const kcalBurned =
    met *
    (user?.weight || 60) *
    (durationMinutes / 60);

  const performanceScore =
    calculatePerformanceScore({
      completedSets: sets,
      targetSets:
        session.targetSets,
      perceivedDifficulty: rpe,
    });

  const fatigueImpact =
    calculateFatigue({
      intensity: session.intensity,
      duration: durationMinutes,
      perceivedDifficulty: rpe,
    });

  session.endTime = endTime;

  session.durationMinutes =
    Math.round(durationMinutes);

  session.actualCalories =
    Math.round(kcalBurned);

  session.completedSets = sets;

  session.completedReps = reps;

  session.perceivedDifficulty = rpe;

  session.performanceScore =
    performanceScore;

  session.fatigueImpact =
    fatigueImpact;

  session.completed = true;

  await session.save();

  await updateExerciseStats({
    userId: session.userId,
    exerciseId:
      session.exerciseId,
    performanceScore,
    perceivedDifficulty: rpe,
  });

  return session;
}

/**
 * Calories of today's sessions. "Today" is the Vietnam day, whatever
 * the server's timezone is.
 */
async function getTodayKcal(userId) {
  const today = toVNDateString(new Date());
  const start = new Date(`${today}T00:00:00+07:00`);

  const sessions =
    await WorkoutSession.find({
      userId,
      startTime: {
        $gte: start,
        $lt: new Date(start.getTime() + DAY_MS),
      },
    }).lean();

  const totalKcal =
    sessions.reduce(
      (sum, s) =>
        sum + (s.actualCalories || 0),
      0
    );

  return {
    totalKcal:
      Math.round(totalKcal),
  };
}

module.exports = {
  startWorkout,
  stopWorkout,
  getTodayKcal,
  getWorkoutHistory,
};