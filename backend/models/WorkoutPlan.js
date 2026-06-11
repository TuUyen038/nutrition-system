const mongoose = require("mongoose");

const WorkoutPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

    // Weekly target calories
    weeklyTargetCalories: { type: Number, default: 0, }, 
    
    weeklyEstimatedCalories: { type: Number, default: 0, },

    // Adapative scores
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
            "full_body_push",
            "full_body_pull",
            "full_body_legs",
            "recovery",
          ],
        },

        // daily target calories
        dailyTargetCalories: { type: Number, default: 0, },

        estimatedCalories: { type: Number, default: 0, },

        totalDuration: { type: Number, default: 0, },

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
  currentWeek: 1
}, {
  unique: true
});

module.exports = mongoose.model(
  "WorkoutPlan",
  WorkoutPlanSchema
);