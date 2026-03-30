const ActivityMet = require('../models/ActivityMet');

function suggestDuration(user, exercise) {
  const { goal } = user;
  const { activityType, defaultIntensity } = exercise;

  if (goal === "gain_weight") {
    if (activityType === "strength_training") {
      if (defaultIntensity === "moderate") return 25;
      if (defaultIntensity === "high") return 35;
    }
    // otherwise 20–30 minutes (random)
    return Math.floor(Math.random() * 11) + 20;
  } else if (goal === "lose_weight") {
    if (defaultIntensity === "high") return 40;
    return 30;
  } else if (goal === "maintain") {
    return 30;
  }
  return 30; // default
}

async function getMET(activityType, defaultIntensity) {
  const intensityMap = {
    low: "light",
    moderate: "moderate",
    high: "vigorous"
  };
  const mappedIntensity = intensityMap[defaultIntensity] || defaultIntensity;
  const doc = await ActivityMet.findOne({ activityType, intensity: mappedIntensity });
  return doc ? doc.met : null;
}

function calculateCalories({ met, weight, durationMinutes }) {
  return met * weight * (durationMinutes / 60);
}

async function buildExerciseResult(user, exercise) {
  const duration = suggestDuration(user, exercise);
  const met = await getMET(exercise.activityType, exercise.defaultIntensity);
  const kcal = calculateCalories({ met, weight: user.weight, durationMinutes: duration });
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    activityType: exercise.activityType,
    intensity: exercise.defaultIntensity,
    duration,
    met,
    kcal
  };
}

module.exports = {
  suggestDuration,
  getMET,
  calculateCalories,
  buildExerciseResult
};

// Example usage
// const user = { weight: 44, goal: "gain_weight" };
// const exercise = { activityType: "strength_training", defaultIntensity: "moderate", exerciseId: 1, name: "Push-up" };
// buildExerciseResult(user, exercise).then(result => console.log(result));