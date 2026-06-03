const mongoose = require("mongoose");

const WorkoutSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkoutPlan",
      required: true,
    },

    day: {
      type: Number,
      required: true,
    },

    focus: {
      type: String,
      default: "",
    },

    exerciseId: {
      type: Number,
      required: true,
    },

    exerciseName: {
      type: String,
      default: "",
    },

    intensity: {
      type: String,
      enum: ["light", "moderate", "vigorous"],
      required: true,
    },

    targetSets: {
      type: Number,
      default: 0,
    },

    targetReps: {
      type: String,
      default: "",
    },

    completedSets: {
      type: Number,
      default: 0,
    },

    completedReps: {
      type: Number,
      default: 0,
    },

    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: 0,
    },

    targetCalories: {
      type: Number,
      default: 0,
    },

    actualCalories: {
      type: Number,
      default: 0,
    },

    perceivedDifficulty: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },

    performanceScore: {
      type: Number,
      default: 0,
    },

    fatigueImpact: {
      type: Number,
      default: 0,
    },

    completed: {
      type: Boolean,
      default: false,
    },

    skipped: {
      type: Boolean,
      default: false,
    },

    muscleGroups: [String],

    userFeedback: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "WorkoutSession",
  WorkoutSessionSchema
);