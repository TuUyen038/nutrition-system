module.exports = {
  StartWorkoutRequest: {
    type: "object",
    required: [
      "userId",
      "planId",
      "day",
      "exerciseId",
    ],
    properties: {
      userId: {
        type: "string",
        example:
          "689e1234abcd5678ef901234",
      },

      planId: {
        type: "string",
        example:
          "689e1234abcd5678ef909999",
      },

      day: {
        type: "number",
        example: 1,
      },

      exerciseId: {
        type: "number",
        example: 101,
      },
    },
  },

  StopWorkoutRequest: {
    type: "object",
    required: [
      "sessionId",
      "completedSets",
      "completedReps",
      "perceivedDifficulty",
    ],
    properties: {
      sessionId: {
        type: "string",
        example:
          "689e1234abcd5678ef905555",
      },

      completedSets: {
        type: "number",
        example: 3,
      },

      completedReps: {
        type: "number",
        example: 12,
      },

      perceivedDifficulty: {
        type: "number",
        minimum: 1,
        maximum: 10,
        example: 7,
      },
    },
  },

  WorkoutSession: {
    type: "object",

    properties: {
      _id: {
        type: "string",
        example:
          "689e1234abcd5678ef905555",
      },

      userId: {
        type: "string",
        example:
          "689e1234abcd5678ef901234",
      },

      planId: {
        type: "string",
        example:
          "689e1234abcd5678ef909999",
      },

      day: {
        type: "number",
        example: 1,
      },

      focus: {
        type: "string",
        example: "push",
      },

      exerciseId: {
        type: "number",
        example: 101,
      },

      exerciseName: {
        type: "string",
        example: "Push Up",
      },

      intensity: {
        type: "string",
        enum: [
          "light",
          "moderate",
          "vigorous",
        ],
        example: "moderate",
      },

      targetSets: {
        type: "number",
        example: 3,
      },

      targetReps: {
        type: "string",
        example: "10-12",
      },

      completedSets: {
        type: "number",
        example: 3,
      },

      completedReps: {
        type: "number",
        example: 12,
      },

      startTime: {
        type: "string",
        format: "date-time",
      },

      endTime: {
        type: "string",
        format: "date-time",
      },

      durationMinutes: {
        type: "number",
        example: 35,
      },

      targetCalories: {
        type: "number",
        example: 220,
      },

      actualCalories: {
        type: "number",
        example: 245,
      },

      perceivedDifficulty: {
        type: "number",
        example: 7,
      },

      performanceScore: {
        type: "number",
        example: 8,
      },

      fatigueImpact: {
        type: "number",
        example: 6,
      },

      completed: {
        type: "boolean",
        example: true,
      },

      skipped: {
        type: "boolean",
        example: false,
      },

      muscleGroups: {
        type: "array",
        items: {
          type: "string",
        },
        example: [
          "chest",
          "triceps",
        ],
      },

      userFeedback: {
        type: "string",
        example:
          "Workout felt challenging but good",
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

  TodayKcalResponse: {
    type: "object",
    properties: {
      totalKcal: {
        type: "number",
        example: 540,
      },
    },
  },
};