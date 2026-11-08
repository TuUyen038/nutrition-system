const mongoose = require("mongoose");

const sleepSchema = new mongoose.Schema(
  {
    durationMinutes: {
      type: Number,
      default: null,
      min: 0,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const googleHealthDataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Daily summary date, format YYYY-MM-DD.
    date: {
      type: String,
      required: true,
    },

    steps: {
      type: Number,
      default: null,
      min: 0,
    },

    caloriesBurned: {
      type: Number,
      default: null,
      min: 0,
    },

    activeMinutes: {
      type: Number,
      default: null,
      min: 0,
    },

    sleep: {
      type: sleepSchema,
      default: () => ({}),
    },

    source: {
      type: String,
      default: "google_health_mock",
      enum: ["google_health_mock", "google_health"],
    },

    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// One daily summary per user.
googleHealthDataSchema.index(
  { userId: 1, date: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "GoogleHealthData",
  googleHealthDataSchema
);
