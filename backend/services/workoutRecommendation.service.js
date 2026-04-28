const Exercise = require("../models/Exercise");
const User = require("../models/User");

// ====================
// MAPPING CONSTANTS
// ====================

// Map fitnessLevel to workout level
const FITNESS_TO_WORKOUT_LEVEL = {
  sedentary: "beginner",
  beginner: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
  athlete: "advanced",
};

// Target calories burn per day based on goal
const GOAL_CALORIES_TARGET = {
  lose_weight: 400,
  maintain_weight: 200,
  gain_weight: 150,
};

// Workout days per week by level
const WORKOUT_DAYS_BY_LEVEL = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

// Workout splits by level
const WORKOUT_SPLITS = {
  beginner: ["full_body"], // 3 days: full_body x3
  intermediate: ["upper", "lower", "upper", "lower"], // 4 days: upper/lower split
  advanced: ["push", "pull", "legs", "push", "pull"], // 5 days: push/pull/legs split
};

// Muscle group mappings (based on exercise categories and muscles)
const MUSCLE_GROUP_MAPPINGS = {
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps", "rear_delts"],
  legs: ["quads", "hamstrings", "calves", "glutes"],
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "calves", "glutes"],
  full_body: ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "calves", "glutes"],
};

// Sets and reps by level
const SETS_REPS_BY_LEVEL = {
  beginner: { sets: 3, reps: "10-12", duration: 30 }, // minutes
  intermediate: { sets: 4, reps: "8-10", duration: 45 },
  advanced: { sets: 5, reps: "6-8", duration: 60 },
};

// ====================
// UTILITY FUNCTIONS
// ====================

/**
 * Map fitness level to workout level
 */
function getWorkoutLevel(fitnessLevel) {
  return FITNESS_TO_WORKOUT_LEVEL[fitnessLevel] || "beginner";
}

/**
 * Calculate target calories for workout day
 */
function getTargetCalories(goal) {
  return GOAL_CALORIES_TARGET[goal] || 200;
}

const TOTAL_DAYS = 30;

/**
 * Get workout days and split for the level
 */
function getWorkoutPlanStructure(level) {
  const daysPerWeek = WORKOUT_DAYS_BY_LEVEL[level];
  const split = WORKOUT_SPLITS[level];

  // Create 30-day structure
  const plan = [];
  let splitIndex = 0;

  for (let day = 1; day <= TOTAL_DAYS; day++) {
    const dayOfWeek = ((day - 1) % 7) + 1;
    const isWorkoutDay = dayOfWeek <= daysPerWeek;

    if (isWorkoutDay) {
      const muscleGroup = split[splitIndex % split.length];
      plan.push({
        day,
        type: "workout",
        muscleGroup,
        targetCalories: 0, // Will be set later
        exercises: [],
      });
      splitIndex++;
    } else {
      plan.push({
        day,
        type: "rest",
      });
    }
  }

  return plan;
}

/**
 * Get exercises by muscle group
 */
async function getExercisesByMuscleGroup(muscleGroup) {
  const targetMuscles = MUSCLE_GROUP_MAPPINGS[muscleGroup] || [];

  // Find exercises that target these muscles or match category
  const exercises = await Exercise.find({
    $or: [
      { "muscles.name": { $in: targetMuscles } },
      { "muscles.name_en": { $in: targetMuscles } },
      { category: { $regex: new RegExp(muscleGroup, "i") } },
      { name: { $regex: new RegExp(muscleGroup, "i") } },
    ],
    activityType: { $in: ["strength_training", "calisthenics", "functional_training"] },
  }).limit(30); // Limit to avoid too many results

  // If no exercises found with specific muscles, get general strength exercises
  if (exercises.length === 0) {
    return await Exercise.find({
      activityType: "strength_training",
    }).limit(20);
  }

  return exercises;
}

/**
 * Calculate calories for exercise
 * Formula: MET × weight (kg) × duration (hours)
 */
async function calculateExerciseCalories(exercise, weight, durationMinutes, intensity = "moderate") {
  const ActivityMet = require("../models/ActivityMet");

  // Try to get MET from database
  let metValue = 5.0; // Default moderate intensity MET

  try {
    const metData = await ActivityMet.findOne({
      activityType: exercise.activityType,
      intensity: intensity,
    });

    if (metData) {
      metValue = metData.met;
    }
  } catch (error) {
    // Use default MET if database query fails
    console.warn("Could not fetch MET data, using default:", error.message);
  }

  const durationHours = durationMinutes / 60;
  return Math.round(metValue * weight * durationHours);
}

/**
 * Generate exercises for a workout day
 */
async function generateDayExercises(muscleGroup, level, userWeight, targetCalories) {
  const exercises = await getExercisesByMuscleGroup(muscleGroup);
  const { sets, reps, duration } = SETS_REPS_BY_LEVEL[level];

  // Shuffle exercises to randomize
  const shuffled = exercises.sort(() => 0.5 - Math.random());

  const selectedExercises = [];
  let totalCalories = 0;
  const maxExercises = level === "beginner" ? 4 : level === "intermediate" ? 5 : 6;

  for (let i = 0; i < Math.min(maxExercises, shuffled.length); i++) {
    const exercise = shuffled[i];

    // Calculate duration per exercise (distribute total workout time)
    const exerciseDuration = Math.max(5, duration / maxExercises);

    const calories = await calculateExerciseCalories(exercise, userWeight, exerciseDuration);

    selectedExercises.push({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      sets,
      reps,
      duration: exerciseDuration,
      calories,
    });

    totalCalories += calories;

    // Stop if close to target (within 20% of target)
    if (totalCalories >= targetCalories * 0.8) {
      break;
    }
  }

  return selectedExercises;
}

/**
 * Generate complete workout plan
 */
async function generateWorkoutPlan(userId) {
  // Get user data
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const workoutLevel = getWorkoutLevel(user.fitnessLevel);
  const targetCalories = getTargetCalories(user.goal);

  // Generate plan structure
  const plan = getWorkoutPlanStructure(workoutLevel);

  // Generate exercises for workout days
  for (const day of plan) {
    if (day.type === "workout") {
      day.targetCalories = targetCalories;
      day.exercises = await generateDayExercises(
        day.muscleGroup,
        workoutLevel,
        user.weight,
        targetCalories
      );
    }
  }

  return {
    userId,
    workoutLevel,
    targetCalories,
    plan,
    generatedAt: new Date(),
  };
}

module.exports = {
  generateWorkoutPlan,
  getWorkoutLevel,
  getTargetCalories,
  getWorkoutPlanStructure,
  getExercisesByMuscleGroup,
  calculateExerciseCalories,
};