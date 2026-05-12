const mongoose = require("mongoose");

const UserExerciseStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    exerciseId: {
      type: Number,
      required: true,
    },

    totalSessions: {
      type: Number,
      default: 0,
    },

    completedSessions: {
      type: Number,
      default: 0,
    },

    totalPerformanceScore: {
      type: Number,
      default: 0,
    },

    avgPerformanceScore: {
      type: Number,
      default: 0,
    },

    totalDifficulty: {
      type: Number,
      default: 0,
    },

    avgDifficulty: {
      type: Number,
      default: 0,
    },

    preferenceScore: {
      type: Number,
      default: 0,
    },

    lastPerformedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserExerciseStatsSchema.index({
  userId: 1,
  exerciseId: 1,
});

module.exports = mongoose.model(
  "UserExerciseStats",
  UserExerciseStatsSchema
);