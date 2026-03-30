const mongoose = require("mongoose");

const WorkoutSessionSchema = new mongoose.Schema(
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
    intensity: {
      type: String,
      enum: ["light", "moderate", "vigorous"],
      required: true,
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
      default: null,
    },
    kcalBurned: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const WorkoutSession = mongoose.model("WorkoutSession", WorkoutSessionSchema);

module.exports = WorkoutSession;