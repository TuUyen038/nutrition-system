module.exports = {
  WorkoutExercise: {
    type: "object",

    properties: {
      exerciseId: {
        type: "number",
        example: 101,
      },

      name: {
        type: "string",
        example: "Push Up",
      },

      sets: {
        type: "number",
        example: 3,
      },

      reps: {
        type: "string",
        example: "10-12",
      },

      duration: {
        type: "number",
        example: 15,
        description: "Duration in minutes",
      },

      calories: {
        type: "number",
        example: 80,
      },

      intensity: {
        type: "string",
        enum: ["light", "moderate", "vigorous"],
        example: "moderate",
      },
    },
  },

  WorkoutDay: {
    type: "object",

    properties: {
      day: {
        type: "number",
        example: 1,
      },

      date: {
        type: "string",
        format: "date-time",
      },

      type: {
        type: "string",
        enum: ["workout", "rest"],
        example: "workout",
      },

      focus: {
        type: "string",
        enum: [
          "push",
          "pull",
          "legs",
          "upper",
          "lower",
          "full_body",
          "recovery",
        ],
        example: "push",
      },

      targetCalories: {
        type: "number",
        example: 250,
      },

      estimatedDifficulty: {
        type: "number",
        minimum: 1,
        maximum: 10,
        example: 6,
      },

      completed: {
        type: "boolean",
        example: false,
      },

      skipped: {
        type: "boolean",
        example: false,
      },

      completedAt: {
        type: "string",
        format: "date-time",
      },

      exerciseDetails: {
        type: "array",

        items: {
          $ref: "#/components/schemas/WorkoutExercise",
        },
      },

      totalCalories: {
        type: "number",
        example: 320,
      },

      totalDuration: {
        type: "number",
        example: 45,
        description: "Minutes",
      },
    },
  },

  WorkoutPlan: {
    type: "object",

    properties: {
      _id: {
        type: "string",
      },

      userId: {
        type: "string",
      },

      workoutLevel: {
        type: "string",

        enum: [
          "beginner",
          "intermediate",
          "advanced",
        ],

        example: "beginner",
      },

      currentWeek: {
        type: "number",
        example: 1,
      },

      weekStartDate: {
        type: "string",
        format: "date-time",
      },

      weekEndDate: {
        type: "string",
        format: "date-time",
      },

      adaptiveScore: {
        type: "number",
        example: 75,
      },

      fatigueScore: {
        type: "number",
        example: 20,
      },

      progressionScore: {
        type: "number",
        example: 85,
      },

      targetCalories: {
        type: "number",
        example: 250,
      },

      days: {
        type: "array",

        items: {
          $ref: "#/components/schemas/WorkoutDay",
        },
      },

      generatedAt: {
        type: "string",
        format: "date-time",
      },

      isActive: {
        type: "boolean",
        example: true,
      },

      createdAt: {
        type: "string",
        format: "date-time",
      },

      updatedAt: {
        type: "string",
        format: "date-time",
      },
    },
  },

  WorkoutPlanStats: {
    type: "object",

    properties: {
      currentWeek: {
        type: "number",
        example: 2,
      },

      totalWorkoutDays: {
        type: "number",
        example: 20,
      },

      completedDays: {
        type: "number",
        example: 15,
      },

      skippedDays: {
        type: "number",
        example: 2,
      },

      remainingDays: {
        type: "number",
        example: 3,
      },

      completionRate: {
        type: "number",
        example: 75,
      },

      totalCaloriesBurned: {
        type: "number",
        example: 5400,
      },

      adaptiveScore: {
        type: "number",
        example: 80,
      },

      fatigueScore: {
        type: "number",
        example: 25,
      },

      progressionScore: {
        type: "number",
        example: 88,
      },
    },
  },
};