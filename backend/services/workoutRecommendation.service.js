const Exercise = require("../models/Exercise");
const User = require("../models/User");
const WorkoutPlan = require("../models/WorkoutPlan");
const ActivityMet = require("../models/ActivityMet");
const { getTrainingState } = require("./trainingState.service");
const {
  rankExercises,
  expandMuscles,
} = require("./exerciseScoring.service");
const {
  exerciseScoring: SCORING_CONFIG,
} = require("../config/adaptiveWorkout.config");

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
  lose_weight: {
    beginner: 250,
    intermediate: 400,
    advanced: 550,
  },

  maintain_weight: {
    beginner: 150,
    intermediate: 250,
    advanced: 350,
  },

  gain_weight: {
    beginner: 120,
    intermediate: 180,
    advanced: 250,
  },
};

// Workout days per week by level
const WORKOUT_PATTERNS = {
  beginner: [1, 3, 5],
  intermediate: [1, 2, 4, 6],
  advanced: [1, 2, 3, 5, 6],
};

// Workout splits by level
const WORKOUT_SPLITS = {
  beginner: ["full_body_push", "full_body_pull", "full_body_legs"], // 3 days: full_body x3
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
  full_body_push: ["chest", "shoulders", "triceps", "quads"],
  full_body_pull: ["back", "biceps", "hamstrings"],
  full_body_legs: ["quads", "glutes", "calves", "hamstrings"],
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
  // Fatigue / Recovery / Performance are computed in trainingState.service.
  // Intensity comes from the status (ready/normal/tired/overreached),
  // not from a single readiness threshold.
  const state = await getTrainingState(userId);

  return {
    fatigueScore: state.fatigueScore,
    recoveryScore: state.recoveryScore,
    avgPerformanceScore: state.performanceScore,
    readinessScore: state.readinessScore,
    status: state.status,
    isColdStart: state.isColdStart,
    recommendedIntensity: state.recommendedIntensity,
  };
}

// =====================================
// GET EXERCISES BY FOCUS
// =====================================

async function getExercisesByFocus(focus) {
  // DB names are e.g. "Chest" / "Pectoralis major": match every alias,
  // case-insensitive (a plain $in on "chest" would miss "Chest").
  const muscles = [
    ...expandMuscles(MUSCLE_GROUP_MAPPINGS[focus] || []),
  ].map((name) => new RegExp(`^${name}$`, "i"));

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
  })
    .limit(SCORING_CONFIG.candidatePoolSize)
    .lean();

  if (!exercises.length) {
    exercises = await Exercise.find({
      activityType: "strength_training",
    })
      .limit(20)
      .lean();
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
    });

    if (
      metData &&
      metData.mets &&
      metData.mets[intensity]
    ) {
      met = metData.mets[intensity];
    }
  } catch (err) {}

  return Math.round((met * weight * duration) / 60);
}

// =====================================
// GENERATE DAY EXERCISES
// =====================================

async function generateDayExercises({
  userId,
  user,
  state,
  focus,
  level,
  weight,
  dailyTargetCalories,
  intensity,
  recoveryScore,
  recentExerciseIds,
  weekStartDate,
}) {
  const exercises = await getExercisesByFocus(focus);

  // Step 5: weighted scoring (exerciseScoring.service) replaces the old
  // ad-hoc score + random shuffle. `ranked` is already in pick order
  // (best first, with muscle-group diversity).
  const { ranked } = await rankExercises(exercises, {
    userId,
    user,
    level,
    focusGroups: MUSCLE_GROUP_MAPPINGS[focus] || [],
    state,
    previousDayExerciseIds: recentExerciseIds,
    variationDate: weekStartDate,
  });

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

  // Recovery-aware adjustment
  if (recoveryScore <= 4) {
    maxExercises -= 1;
  }

  if (recoveryScore <= 2) {
    intensity = "light";
  }

  maxExercises = Math.max(2, maxExercises);

  const selected = [];

  let totalCalories = 0;
  
  // Walk the whole ranked list: an exercise skipped for calories is
  // replaced by the next best one instead of leaving the day short.
  for (const item of ranked) {
    if (selected.length >= maxExercises) {
      break;
    }

    const exercise = item.exercise;

    const duration =
      Math.max(
        5,
        config.duration / maxExercises
      ) + Math.floor(Math.random() * 4);

    const calories = await calculateCalories(
      exercise,
      weight,
      duration,
      intensity
    );

    // Nếu vượt quá nhiều thì bỏ qua bài này
    if (
      totalCalories + calories >
      dailyTargetCalories
    ) {
      continue;
    }

    selected.push({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      sets: config.sets,
      reps: config.reps,
      duration,
      calories,
      intensity,
      score: item.finalScore,
    });

    totalCalories += calories;

    if (totalCalories >= dailyTargetCalories) {
      break;
    }
  }

  return {
    exercises: selected,
    estimatedCalories: totalCalories,
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
  const splits = WORKOUT_SPLITS[level];
  const workoutPattern = WORKOUT_PATTERNS[level];

  const week = [];
  let splitIndex = 0;

  for (let day = 1; day <= 7; day++) {
    const isWorkoutDay = workoutPattern.includes(day);

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

async function generateAdaptiveWorkoutPlan(
  userId,
  {
    baseDate = new Date(),
    currentWeek = 1,
  } = {}
) {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const workoutLevel = getWorkoutLevel(user.fitnessLevel);

  const dailyTargetCalories = GOAL_TARGET_CALORIES[user.goal]?.[workoutLevel] || 200;

  const state = await analyzeUserState(userId);

  let weeklyStructure = createWeeklyStructure(
    workoutLevel
  );

  // Recovery-aware adjustment
  if (state.recoveryScore <= 3) {

    // Convert 1 workout day to rest
    const workoutIndex =
      weeklyStructure.findIndex(
        (d) => d.type === "workout"
      );

    if (workoutIndex !== -1) {
      weeklyStructure[
        workoutIndex
      ] = {
        ...weeklyStructure[
          workoutIndex
        ],
        type: "rest",
        focus: "recovery",
      };
    }
  }

  // High fatigue -> reduce training frequency
  if (state.fatigueScore >= 8) {

    const lastWorkoutIndex =
      weeklyStructure
        .map((d, index) => ({
          ...d,
          index,
        }))
        .reverse()
        .find(
          (d) =>
            d.type === "workout"
        )?.index;

    if (
      lastWorkoutIndex !== undefined
    ) {
      weeklyStructure[
        lastWorkoutIndex
      ] = {
        ...weeklyStructure[
          lastWorkoutIndex
        ],
        type: "rest",
        focus: "recovery",
      };
    }
  }

  const today = new Date(baseDate);

  const days = [];

  let recentExerciseIds = [];
  let weeklyEstimatedCalories = 0;
  let weeklyTargetCalories = 0;

  for (const item of weeklyStructure) {
    const currentDate = new Date(today);

    currentDate.setDate(today.getDate() + (item.day - 1));

    if (item.type === "rest") {
      days.push({
        day: item.day,
        date: currentDate,
        type: "rest",
        focus: "recovery",
        dailyTargetCalories: 0,
        estimatedCalories: 0,
        totalDuration: 0,
        exerciseDetails: [],
        estimatedDifficulty: 1,
        completed: false,
        skipped: false,
      });

      continue;
    }

    const generated = await generateDayExercises({
      userId,
      user,
      state,
      focus: item.focus,
      level: workoutLevel,
      weight: user.weight,
      dailyTargetCalories,
      intensity: state.recommendedIntensity,
      recoveryScore: state.recoveryScore,
      recentExerciseIds,
      weekStartDate: today,
    });

    recentExerciseIds = generated.exercises.map(
      e => e.exerciseId
    );

    weeklyEstimatedCalories += generated.estimatedCalories;
    weeklyTargetCalories += dailyTargetCalories;

    let estimatedDifficulty = 6;

    if (state.recommendedIntensity === "light") {
      estimatedDifficulty = 4;
    }

    if (state.recommendedIntensity === "vigorous") {
      estimatedDifficulty = 8;
    }

    estimatedDifficulty += Math.floor(Math.random() * 3) - 1;

    estimatedDifficulty = Math.max(
      1,
      Math.min(10, estimatedDifficulty)
    );

    days.push({
      day: item.day,
      date: currentDate,
      type: "workout",
      focus: item.focus,

      dailyTargetCalories,
    
      estimatedCalories: generated.estimatedCalories,

      totalDuration: generated.totalDuration,

      estimatedDifficulty,

      exerciseDetails: generated.exercises,      

      completed: false,
      skipped: false,
    }); 
  }

  return {
    workoutLevel,

    currentWeek,

    weeklyTargetCalories,

    weeklyEstimatedCalories,

    fatigueScore: state.fatigueScore,

    recoveryScore: state.recoveryScore,

    avgPerformanceScore: state.avgPerformanceScore,

    readinessScore: state.readinessScore,

    weekStartDate: today,

    weekEndDate: new Date(
      today.getTime() + 6 * 24 * 60 * 60 * 1000
    ),

    days,
  };
}

// =====================================
// PREVIEW EXERCISE RANKING (debug / calibration)
// =====================================

async function previewExerciseRanking(userId, focus, limit = 10) {
  if (!MUSCLE_GROUP_MAPPINGS[focus]) {
    const error = new Error(
      `focus must be one of: ${Object.keys(MUSCLE_GROUP_MAPPINGS).join(", ")}`
    );
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId).lean();

  if (!user) {
    throw new Error("User not found");
  }

  const level = getWorkoutLevel(user.fitnessLevel);
  const state = await analyzeUserState(userId);
  const exercises = await getExercisesByFocus(focus);

  const { ranked, excluded } = await rankExercises(exercises, {
    userId,
    user,
    level,
    focusGroups: MUSCLE_GROUP_MAPPINGS[focus],
    state,
  });

  return {
    focus,
    level,
    status: state.status,
    readinessScore: state.readinessScore,
    candidates: exercises.length,
    excluded,
    top: ranked.slice(0, limit).map((item) => ({
      exerciseId: item.exercise.exerciseId,
      name: item.exercise.name,
      difficulty: item.exercise.difficulty ?? null,
      primaryGroups: item.primaryGroups,
      score: item.score,
      finalScore: item.finalScore,
      components: item.components,
      usedWeights: item.usedWeights,
    })),
  };
}

module.exports = {
  generateAdaptiveWorkoutPlan,
  previewExerciseRanking,
};