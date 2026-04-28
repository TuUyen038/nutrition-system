const mongoose = require("mongoose");

/**
 * WorkoutPlan Schema
 * Stores weekly workout plan for each user
 * Only stores exerciseIds (not full exercise data) for optimization
 */
const WorkoutPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One plan per user
      index: true,
    },
    workoutLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
    },
    targetCalories: {
      type: Number,
      default: 200,
    },
    plan: {
      type: [
        {
          day: {
            type: Number,
            min: 1,
            max: 30,
            required: true,
          },
          type: {
            type: String,
            enum: ["workout", "rest"],
            required: true,
          },
          exerciseIds: {
            type: [Number],
            default: [],
          },
          exerciseDetails: {
            type: [
              {
                exerciseId: {
                  type: Number,
                  required: true,
                },
                name: {
                  type: String,
                  default: "",
                },
                duration: {
                  type: Number, // minutes
                  default: 0,
                },
                calories: {
                  type: Number,
                  default: 0,
                },
                sets: {
                  type: Number,
                  default: 3,
                },
                reps: {
                  type: String,
                  default: "10-12",
                },
              },
            ],
            default: [],
          },
          muscleGroup: {
            type: [
              {
                id: Number,
                name: String,
                name_en: String,
              },
            ],
            default: [],
          },
          totalDuration: {
            type: Number, // minutes
            default: 0,
          },
          totalCalories: {
            type: Number,
            default: 0,
          },
          completed: {
            type: Boolean,
            default: false,
          },
          completedAt: {
            type: Date,
            default: null,
          },
        },
      ],
      default: [],
    },
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

// Index for efficient queries
WorkoutPlanSchema.index({ userId: 1, isActive: 1 });
WorkoutPlanSchema.index({ "plan.day": 1 });

const WorkoutPlan = mongoose.model("WorkoutPlan", WorkoutPlanSchema);

module.exports = WorkoutPlan;