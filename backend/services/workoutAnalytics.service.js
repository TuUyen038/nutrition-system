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
      avgPerformanceScore: 5,
      readinessScore: 7,
    };
  }

  const avgDifficulty =
    sessions.reduce(
      (sum, s) =>
        sum + (s.perceivedDifficulty || 5),
      0
    ) / sessions.length;

  const avgPerformanceScore =
    sessions.reduce(
      (sum, s) =>
        sum + (s.performanceScore || 0),
      0
    ) / sessions.length;

  // Fatigue score (điểm mệt mỏi) được tính dựa trên độ khó trung bình và hiệu suất trung bình
  let fatigueScore = avgDifficulty;

  if (avgPerformanceScore < 5) {
    fatigueScore += 2;
  }

  fatigueScore = Math.min(
    10,
    Math.round(fatigueScore)
  );

  // Recovery score (điểm phục hồi) được tính dựa trên điểm mệt mỏi
  const recoveryScore = Math.max(
    1,
    10 - fatigueScore
  );

  // Readiness score (điểm sẵn sàng) được tính dựa trên điểm mệt mỏi và hiệu suất trung bình
  const readinessScore = Math.round(
    recoveryScore * 0.6 +
    avgPerformanceScore * 0.4
  );

  return {
    fatigueScore,

    recoveryScore,

    avgPerformanceScore:
      Math.round(avgPerformanceScore),

    readinessScore,
  };
}

module.exports = {
  calculateUserPerformance,
};