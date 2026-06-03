const WorkoutSession = require("../models/WorkoutSession");

async function calculateUserPerformance(userId) {
  const sessions = await WorkoutSession.find({
    userId,
    completed: true,
  })
    .sort({ createdAt: -1 })
    .limit(30);

  if (!sessions.length) {
    return {
      fatigueScore: 0,
      recoveryScore: 8,
      progressionScore: 1,
    };
  }

  const avgDifficulty =
    sessions.reduce(
      (sum, s) =>
        sum + (s.perceivedDifficulty || 5),
      0
    ) / sessions.length;

  const avgPerformance =
    sessions.reduce(
      (sum, s) =>
        sum + (s.performanceScore || 0),
      0
    ) / sessions.length;

  let fatigueScore = avgDifficulty;

  if (avgPerformance < 5) {
    fatigueScore += 2;
  }

  fatigueScore = Math.min(
    10,
    Math.round(fatigueScore)
  );

  const recoveryScore = Math.max(
    1,
    10 - fatigueScore
  );

  return {
    fatigueScore,

    recoveryScore,

    progressionScore: Math.round(
      avgPerformance
    ),
  };
}

module.exports = {
  calculateUserPerformance,
};