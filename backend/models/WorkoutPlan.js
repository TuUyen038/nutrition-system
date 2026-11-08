const mongoose = require("mongoose");

const exerciseDetailSchema = new mongoose.Schema(
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

    // Weighted score (0-1) from exerciseScoring.service
    score: Number,
  },
);

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

        exerciseDetails: [exerciseDetailSchema],

        // ----- Step 6: adaptation -----
        // The day as generated, kept the first time the day is adapted, so
        // every adaptation is computed from it (never stacked) and can be
        // undone when the user's state improves.
        original: {
          type: { type: String, enum: ["workout", "rest"] },
          focus: String,
          estimatedDifficulty: Number,
          exerciseDetails: [exerciseDetailSchema],
        },

        adaptation: {
          action: {
            type: String,
            enum: ["increase", "maintain", "reduce_intensity", "light_session", "rest"],
          },
          reasons: [String],
          appliedAt: Date,
        },

        // ----- Step 7: exercises the user replaced on this day -----
        // Re-applied by adaptivePlan whenever the day is recomputed, so
        // the user's choice is not lost when the state changes.
        substitutions: [
          {
            fromExerciseId: Number,
            fromName: String,
            toExerciseId: Number,
            toName: String,
            reason: String,
            at: Date,
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

    // Step 6: last time adaptPlan ran (once a day automatically).
    lastAdaptedAt: {
      type: Date,
      default: null,
    },

    // Step 6: decision log, newest last.
    adaptations: [
      {
        at: Date,
        // "generation" (rest-day rules when the week is created) or
        // "daily" (adaptPlan).
        source: { type: String, default: "daily" },
        action: String,
        reasons: [String],
        status: String,
        readinessScore: Number,
        fatigueScore: Number,
        recoveryScore: Number,
        days: [Number],
      },
    ],
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