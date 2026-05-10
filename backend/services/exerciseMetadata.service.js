const Exercise = require("../models/Exercise");

function detectDifficulty(exercise) {
  const name = exercise.name.toLowerCase();

  if (name.includes("muscle up")) {
    return "advanced";
  }

  if (
    name.includes("pull up") ||
    name.includes("chin up")
  ) {
    return "intermediate";
  }

  return "beginner";
}

function detectExerciseType(exercise) {
  const name = exercise.name.toLowerCase();

  if (
    name.includes("squat") ||
    name.includes("deadlift") ||
    name.includes("bench") ||
    name.includes("pull up")
  ) {
    return "compound";
  }

  return "isolation";
}

function detectImpactLevel(exercise) {
  const name = exercise.name.toLowerCase();

  if (
    name.includes("jump") ||
    name.includes("burpee")
  ) {
    return "high";
  }

  return "medium";
}

function detectFatigueScore(exercise) {
  const name = exercise.name.toLowerCase();

  if (name.includes("deadlift")) return 10;
  if (name.includes("squat")) return 8;
  if (name.includes("burpee")) return 8;

  return 4;
}

async function enrichExerciseMetadata() {
  const exercises = await Exercise.find();

  const operations = exercises.map((exercise) => ({
    updateOne: {
      filter: { _id: exercise._id },
      update: {
        $set: {
          difficulty: detectDifficulty(exercise),
          exerciseType: detectExerciseType(exercise),
          impactLevel: detectImpactLevel(exercise),
          fatigueScore: detectFatigueScore(exercise),
        },
      },
    },
  }));

  await Exercise.bulkWrite(operations);

  console.log("[Exercise Metadata] Enriched successfully");
}

module.exports = {
  enrichExerciseMetadata,
};