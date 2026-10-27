const { getTrainingState } = require("./trainingState.service");

/**
 * Kept for backward compatibility: old callers expect these 4 numbers.
 * The real calculation now lives in trainingState.service.js.
 */
async function calculateUserPerformance(userId) {
  const state = await getTrainingState(userId);

  return {
    fatigueScore: state.fatigueScore,
    recoveryScore: state.recoveryScore,
    avgPerformanceScore: state.performanceScore,
    readinessScore: state.readinessScore,
  };
}

module.exports = {
  calculateUserPerformance,
};
