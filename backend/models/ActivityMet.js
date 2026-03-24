const mongoose = require("mongoose");

const ActivityMetSchema = new mongoose.Schema(
  {
    activityType: {
      type: String,
      required: true,
      index: true,
      enum: [
        "strength_training",
        "calisthenics",
        "cardio_machine",
        "hiit",
        "aerobic_dance",
        "yoga_stretching",
        "functional_training"
      ],
    },
    intensity: {
      type: String,
      required: true,
      enum: ["light", "moderate", "vigorous"],
    },
    met: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

const ActivityMet = mongoose.model("ActivityMet", ActivityMetSchema, "activity_met");

module.exports = ActivityMet;
