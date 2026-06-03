const mongoose = require("mongoose");

const WorkoutPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    workoutLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
    },

    currentWeek: {
      type: Number,
      default: 1,
    },

    weekStartDate: Date,

    weekEndDate: Date,

    fatigueScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },

    recoveryScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },

    avgPerformanceScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },

    readinessScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },

    targetCalories: {
      type: Number,
      default: 200,
    },

    days: [
      {
        day: Number,

        date: Date,

        type: {
          type: String,
          enum: ["workout", "rest"],
        },

        focus: {
          type: String,
          enum: [
            "push",
            "pull",
            "legs",
            "upper",
            "lower",
            "full_body",
            "recovery",
          ],
        },

        targetCalories: Number,

        estimatedDifficulty: {
          type: Number,
          min: 1,
          max: 10,
        },

        completed: {
          type: Boolean,
          default: false,
        },

        skipped: {
          type: Boolean,
          default: false,
        },

        completedAt: Date,

        exerciseDetails: [
          {
            exerciseId: Number,

            name: String,

            sets: Number,

            reps: String,

            duration: Number,

            calories: Number,

            intensity: {
              type: String,
              enum: ["light", "moderate", "vigorous"],
            },
          },
        ],

        totalCalories: Number,

        totalDuration: Number,
      },
    ],

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

WorkoutPlanSchema.index({
  userId: 1,
  isActive: 1,
});

module.exports = mongoose.model(
  "WorkoutPlan",
  WorkoutPlanSchema
);