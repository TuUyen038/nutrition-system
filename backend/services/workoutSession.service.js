const WorkoutSession = require("../models/WorkoutSession");
const WorkoutPlan = require("../models/WorkoutPlan");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const ActivityMet = require("../models/ActivityMet");
const UserExerciseStats = require("../models/UserExerciseStats");

function calculatePerformanceScore({
  completedSets,
  targetSets,
  perceivedDifficulty,
}) {
  let score =
    (completedSets / targetSets) * 10;

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

  stats.avgPerformanceScore =
    (stats.avgPerformanceScore +
      performanceScore) /
    2;

  stats.avgDifficulty =
    (stats.avgDifficulty +
      perceivedDifficulty) /
    2;

  stats.preferenceScore =
    stats.avgPerformanceScore -
    stats.avgDifficulty / 2;

  stats.lastPerformedAt = new Date();

  await stats.save();
}

async function startWorkout({
  userId,
  planId,
  day,
  exerciseId,
}) {
  const active =
    await WorkoutSession.findOne({
      userId,
      endTime: null,
    });

  if (active) {
    throw new Error(
      "Workout session already active"
    );
  }

  const plan =
    await WorkoutPlan.findById(planId);

  if (!plan) {
    throw new Error("Plan not found");
  }

  const dayData = plan.days.find(
    (d) => d.day === day
  );

  const exerciseData =
    dayData.exerciseDetails.find(
      (e) => e.exerciseId === exerciseId
    );

  const exercise =
    await Exercise.findOne({
      exerciseId,
    });

  const session = new WorkoutSession({
    userId,

    planId,

    day,

    focus: dayData.focus,

    exerciseId,

    exerciseName:
      exerciseData.name,

    intensity:
      exerciseData.intensity,

    targetSets:
      exerciseData.sets,

    targetReps:
      exerciseData.reps,

    targetCalories:
      exerciseData.calories,

    muscleGroups:
      exercise?.muscles?.map(
        (m) => m.name_en
      ) || [],

    startTime: new Date(),
  });

  await session.save();

  return session;
}

async function stopWorkout({
  sessionId,
  completedSets,
  completedReps,
  perceivedDifficulty,
}) {
  const session =
    await WorkoutSession.findById(
      sessionId
    );

  if (!session || session.endTime) {
    throw new Error("Session invalid");
  }

  const endTime = new Date();

  const durationMinutes =
    (endTime - session.startTime) /
    1000 /
    60;

  const user = await User.findById(
    session.userId
  );

  const exercise =
    await Exercise.findOne({
      exerciseId:
        session.exerciseId,
    });

  const metData =
    await ActivityMet.findOne({
      activityType:
        exercise.activityType,
    });

  if (!metData) {
    throw new Error(
      `MET data not found for ${exercise.activityType}`
    );
  }

  const met =
    metData.mets?.[
      session.intensity
    ];

  if (!met) {
    throw new Error(
      `MET intensity not found for ${session.intensity}`
    );
  }

  const kcalBurned =
    met *
    user.weight *
    (durationMinutes / 60);

  const performanceScore =
    calculatePerformanceScore({
      completedSets,
      targetSets:
        session.targetSets,
      perceivedDifficulty,
    });

  const fatigueImpact =
    calculateFatigue({
      intensity: session.intensity,
      duration: durationMinutes,
      perceivedDifficulty,
    });

  session.endTime = endTime;

  session.durationMinutes =
    Math.round(durationMinutes);

  session.actualCalories =
    Math.round(kcalBurned);

  session.completedSets =
    completedSets;

  session.completedReps =
    completedReps;

  session.perceivedDifficulty =
    perceivedDifficulty;

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
    perceivedDifficulty,
  });

  return session;
}

async function getTodayKcal(userId) {
  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const sessions =
    await WorkoutSession.find({
      userId,
      startTime: {
        $gte: start,
      },
    });

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
};