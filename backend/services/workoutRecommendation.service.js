const Exercise = require("../models/Exercise");
const User = require("../models/User");
const WorkoutPlan = require("../models/WorkoutPlan");
const ActivityMet = require("../models/ActivityMet");

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
const GOAL_TARGET_CALORIES = {
  lose_weight: 400,
  maintain_weight: 250,
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
  intermediate: ["upper", "lower"], // 4 days: upper/lower split
  advanced: ["push", "pull", "legs"], // 5 days: push/pull/legs split
};

// Muscle group mappings (based on exercise categories and muscles)
const MUSCLE_GROUP_MAPPINGS = {
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps"],
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

// =====================================
// ANALYZE USER STATE
// =====================================

async function analyzeUserState(userId) {
  const existingPlan = await WorkoutPlan.findOne({
    userId,
    isActive: true,
  });

  if (!existingPlan) {
    return {
      fatigueScore: 0,
      progressionScore: 1,
      readinessScore: 8,
      recommendedIntensity: "moderate",
    };
  }

   const completedDays = existingPlan.days.filter(
    (d) => d.completed
  ).length;

  const skippedDays = existingPlan.days.filter(
    (d) => d.skipped
  ).length;

  let fatigueScore = 0;

  fatigueScore += skippedDays * 0.5;

  if (completedDays >= 5) {
    fatigueScore += 2;
  }

  fatigueScore = Math.min(fatigueScore, 10);

  const readinessScore = Math.max(1, 10 - fatigueScore);

  let recommendedIntensity = "moderate";

  if (readinessScore <= 4) {
    recommendedIntensity = "light";
  }

   if (readinessScore >= 8) {
    recommendedIntensity = "vigorous";
  }

  return {
    fatigueScore,
    progressionScore: completedDays,
    readinessScore,
    recommendedIntensity,
  };
}

// =====================================
// GET EXERCISES BY FOCUS
// =====================================

async function getExercisesByFocus(focus) {
  const muscles = MUSCLE_GROUP_MAPPINGS[focus] || [];

  let exercises = await Exercise.find({
    $or: [
      {
        "muscles.name_en": {
          $in: muscles,
        },
      },
      {
        "muscles.name": {
          $in: muscles,
        },
      },
    ],
    activityType: {
      $in: [
        "strength_training",
        "functional_training",
        "calisthenics",
      ],
    },
  }).limit(50);

  if (!exercises.length) {
    exercises = await Exercise.find({
      activityType: "strength_training",
    }).limit(20);
  }

  return exercises;
}

// =====================================
// CALCULATE CALORIES
// =====================================

async function calculateCalories(
  exercise,
  weight,
  duration,
  intensity
) {
  let met = 5;

  try {
    const metData = await ActivityMet.findOne({
      activityType: exercise.activityType,
      intensity,
    });

    if (metData) {
      met = metData.met;
    }
  } catch (err) {}

  return Math.round((met * weight * duration) / 60);
}

// =====================================
// GENERATE DAY EXERCISES
// =====================================

async function generateDayExercises({
  focus,
  level,
  weight,
  targetCalories,
  intensity,
}) {
  const exercises = await getExercisesByFocus(focus);

  const shuffled = exercises.sort(() => 0.5 - Math.random());

  const config = SETS_REPS_BY_LEVEL[level];

  let maxExercises = 4;

  if (level === "intermediate") {
    maxExercises = 5;
  }

  if (level === "advanced") {
    maxExercises = 6;
  }

  // Adaptive volume
  if (intensity === "light") {
    maxExercises -= 1;
  }

  if (intensity === "vigorous") {
    maxExercises += 1;
  }

  const selected = [];

  let totalCalories = 0;
  
  for (let i = 0; i < Math.min(maxExercises, shuffled.length); i++) {
    const exercise = shuffled[i];

    const duration = Math.max(
      5,
      config.duration / maxExercises
    );

    const calories = await calculateCalories(
      exercise,
      weight,
      duration,
      intensity
    );

    selected.push({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      sets: config.sets,
      reps: config.reps,
      duration,
      calories,
      intensity,
    });

     totalCalories += calories;

    if (totalCalories >= targetCalories * 0.8) {
      break;
    }
  }

  return {
    exercises: selected,
    totalCalories,
    totalDuration: selected.reduce(
      (sum, ex) => sum + ex.duration,
      0
    ),
  };
}

// =====================================
// CREATE WEEK STRUCTURE
// =====================================

function createWeeklyStructure(level) {
  const workoutDays = WORKOUT_DAYS_BY_LEVEL[level];

  const splits = WORKOUT_SPLITS[level];

  const week = [];

  let splitIndex = 0;

  for (let day = 1; day <= 7; day++) {
    const isWorkoutDay = day <= workoutDays;

    if (isWorkoutDay) {
      week.push({
        day,
        type: "workout",
        focus: splits[splitIndex % splits.length],
      });

      splitIndex++;
    } else {
      week.push({
        day,
        type: "rest",
        focus: "recovery",
      });
    }
  }

  return week;
}

// =====================================
// GENERATE ADAPTIVE WEEKLY PLAN
// =====================================

async function generateAdaptiveWorkoutPlan(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const workoutLevel = getWorkoutLevel(user.fitnessLevel);

  const targetCalories =
    GOAL_TARGET_CALORIES[user.goal] || 200;

  const state = await analyzeUserState(userId);

  const weeklyStructure = createWeeklyStructure(
    workoutLevel
  );

  const today = new Date();

  const days = [];

  for (const item of weeklyStructure) {
    const currentDate = new Date(today);

    currentDate.setDate(today.getDate() + (item.day - 1));

    if (item.type === "rest") {
      days.push({
        day: item.day,
        date: currentDate,
        type: "rest",
        focus: "recovery",
        targetCalories: 0,
        totalCalories: 0,
        totalDuration: 0,
        exerciseDetails: [],
        estimatedDifficulty: 1,
        completed: false,
        skipped: false,
      });

      continue;
    }

    const generated = await generateDayExercises({
      focus: item.focus,
      level: workoutLevel,
      weight: user.weight,
      targetCalories,
      intensity: state.recommendedIntensity,
    });

    days.push({
      day: item.day,
      date: currentDate,
      type: "workout",
      focus: item.focus,

      targetCalories,

      estimatedDifficulty:
        state.recommendedIntensity === "light"
          ? 4
          : state.recommendedIntensity === "vigorous"
          ? 8
          : 6,

      exerciseDetails: generated.exercises,

      totalCalories: generated.totalCalories,

      totalDuration: generated.totalDuration,

      completed: false,
      skipped: false,
    });
  }

  return {
    workoutLevel,

    currentWeek: 1,

    targetCalories,

    fatigueScore: state.fatigueScore,

    progressionScore: state.progressionScore,

    adaptiveScore: state.readinessScore,

    weekStartDate: today,

    weekEndDate: new Date(
      today.getTime() + 6 * 24 * 60 * 60 * 1000
    ),

    days,
  };
}

module.exports = {
  generateAdaptiveWorkoutPlan,
};