const WorkoutPlan = require("../models/WorkoutPlan");
const workoutRecommendationService = require("./workoutRecommendation.service");
const exerciseService = require("./exercise.service");

const TOTAL_DAYS = 30;

/**
 * ============================================
 * GET CURRENT PLAN (ENRICHED FOR UI)
 * ============================================
 */
const getCurrentPlan = async (userId) => {
  let plan = await WorkoutPlan.findOne({ userId, isActive: true }).lean();

  if (!plan) {
    const newPlan = await generatePlan(userId);
    plan = newPlan.toObject();
  }

  const nextIndex = plan.plan.findIndex(d => !d.completed);

  const currentDay =
    nextIndex === -1 ? plan.plan.length : nextIndex + 1;

  // Transform plan to exclude exerciseIds from response
  const transformedPlan = plan.plan.map(day => {
    const { exerciseIds, ...dayWithoutIds } = day;
    return dayWithoutIds;
  });

  return {
    _id: plan._id,
    userId: plan.userId,
    workoutLevel: plan.workoutLevel,
    targetCalories: plan.targetCalories,
    currentDay,
    plan: transformedPlan,
    generatedAt: plan.generatedAt,
  };
};

/**
 * ============================================
 * GET PLAN WITH EXERCISES (Full detailed response)
 * ============================================
 */
const getPlanWithExercises = async (userId) => {
  let plan = await WorkoutPlan.findOne({ userId, isActive: true }).lean();

  if (!plan) {
    const newPlan = await generatePlan(userId);
    plan = newPlan.toObject();
  }

  // Collect all unique exercise IDs from the plan
  const allExerciseIds = new Set();
  plan.plan.forEach(day => {
    day.exerciseDetails?.forEach(exercise => {
      if (exercise.exerciseId) allExerciseIds.add(exercise.exerciseId);
    });
  });

  // Fetch all exercises in one batch query
  const exercisesMap = new Map();
  if (allExerciseIds.size > 0) {
    const exercises = await exerciseService.getExercisesByIds(Array.from(allExerciseIds));
    exercises.forEach(ex => {
      exercisesMap.set(ex.exerciseId, ex);
    });
  }

  const nextIndex = plan.plan.findIndex(d => !d.completed);
  const currentDay = nextIndex === -1 ? plan.plan.length : nextIndex + 1;

  // Enrich plan with exercise details and build muscleGroup
  const enrichedPlan = plan.plan.map(day => {
    const { exerciseIds, ...dayWithoutIds } = day;

    // Collect all unique muscle groups from exercises for this day
    const uniqueMuscles = new Map(); // Use Map to avoid duplicates by id
    day.exerciseDetails?.forEach(exDetail => {
      const exercise = exercisesMap.get(exDetail.exerciseId);
      if (exercise && exercise.muscles && Array.isArray(exercise.muscles)) {
        exercise.muscles.forEach(muscle => {
          if (!uniqueMuscles.has(muscle.id)) {
            uniqueMuscles.set(muscle.id, muscle);
          }
        });
      }
    });

    // Enrich exerciseDetails with exercise name
    const enrichedExerciseDetails = day.exerciseDetails?.map(exDetail => {
      const exercise = exercisesMap.get(exDetail.exerciseId);
      return {
        ...exDetail,
        name: exercise?.name || "",
      };
    }) || [];

    return {
      ...dayWithoutIds,
      exerciseDetails: enrichedExerciseDetails,
      muscleGroup: Array.from(uniqueMuscles.values()),
    };
  });

  return {
    _id: plan._id,
    userId: plan.userId,
    workoutLevel: plan.workoutLevel,
    targetCalories: plan.targetCalories,
    currentDay,
    plan: enrichedPlan,
    generatedAt: plan.generatedAt,
  };
};

/**
 * ============================================
 * GENERATE PLAN
 * ============================================
 */
const generatePlan = async (userId) => {
  const planData = await workoutRecommendationService.generateWorkoutPlan(userId);

  // Collect all exercise IDs from plan
  const allExerciseIds = new Set();
  planData.plan.forEach(day => {
    (day.exercises || []).forEach(ex => {
      allExerciseIds.add(ex.exerciseId);
    });
  });

  // Fetch all exercises in one batch
  const exercisesMap = new Map();
  if (allExerciseIds.size > 0) {
    const exercises = await exerciseService.getExercisesByIds(Array.from(allExerciseIds));
    exercises.forEach(ex => {
      exercisesMap.set(ex.exerciseId, ex);
    });
  }

  const transformedPlan = planData.plan.slice(0, TOTAL_DAYS).map((day, index) => {
    const exercises = day.exercises || [];

    // Build unique muscle groups for this day
    const uniqueMuscles = new Map(); // Map to avoid duplicates by id
    exercises.forEach(ex => {
      const exercise = exercisesMap.get(ex.exerciseId);
      if (exercise && exercise.muscles && Array.isArray(exercise.muscles)) {
        exercise.muscles.forEach(muscle => {
          if (!uniqueMuscles.has(muscle.id)) {
            uniqueMuscles.set(muscle.id, muscle);
          }
        });
      }
    });

    return {
      day: index + 1,
      type: "workout",

      exerciseDetails: exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        name: exercisesMap.get(ex.exerciseId)?.name || "",
        duration: ex.duration,
        calories: ex.calories,
        sets: ex.sets,
        reps: ex.reps,
      })),

      muscleGroup: Array.from(uniqueMuscles.values()),

      totalDuration: exercises.reduce((sum, ex) => sum + (ex.duration || 0), 0),
      totalCalories: exercises.reduce((sum, ex) => sum + (ex.calories || 0), 0),

      completed: false,
      completedAt: null,
    };
  });

  const workoutPlan = await WorkoutPlan.findOneAndUpdate(
    { userId },
    {
      userId,
      workoutLevel: planData.workoutLevel,
      targetCalories: planData.targetCalories,
      plan: transformedPlan,
      generatedAt: new Date(),
      isActive: true,
    },
    { new: true, upsert: true }
  );

  return workoutPlan;
};

/**
 * ============================================
 * MARK DAY COMPLETED
 * ============================================
 */
const markDayCompleted = async (userId) => {
  const plan = await WorkoutPlan.findOne({ userId, isActive: true });

  if (!plan) {
    throw new Error("No active workout plan found");
  }

  // tìm ngày chưa completed nhỏ nhất
  const nextDayIndex = plan.plan.findIndex((d) => !d.completed);

  if (nextDayIndex === -1) {
    throw new Error("Workout plan already completed");
  }

  plan.plan[nextDayIndex].completed = true;
  plan.plan[nextDayIndex].completedAt = new Date();

  await plan.save();

  // Transform to exclude exerciseIds from response
  const transformedPlan = plan.plan.map(day => {
    const { exerciseIds, ...dayWithoutIds } = day;
    return dayWithoutIds;
  });

  return {
    ...plan.toObject(),
    plan: transformedPlan,
  };
};

/**
 * ============================================
 * REGENERATE PLAN
 * ============================================
 */
const regeneratePlan = async (userId) => {
  await WorkoutPlan.updateMany({ userId }, { isActive: false });

  return await generatePlan(userId);
};

/**
 * ============================================
 * GET STATS
 * ============================================
 */
const getStats = async (userId) => {
  const plan = await WorkoutPlan.findOne({ userId, isActive: true }).lean();

  if (!plan) {
    return {
      totalDays: 0,
      completedDays: 0,
      totalCalories: 0,
      completionRate: 0,
    };
  }

  const completedDays = plan.plan.filter((d) => d.completed).length;

  const totalCalories = plan.plan.reduce(
    (sum, d) => sum + (d.totalCalories || 0),
    0
  );

  return {
    totalDays: TOTAL_DAYS,
    completedDays,
    totalCalories,
    completionRate: Math.round((completedDays / TOTAL_DAYS) * 100),
  };
};

module.exports = {
  getCurrentPlan,
  getPlanWithExercises,
  generatePlan,
  markDayCompleted,
  regeneratePlan,
  getStats,
};