const mongoose = require("mongoose");

const metLevelSchema = new mongoose.Schema(
  {
    light: {
      type: Number,
      min: 0,
      default: null,
    },

    moderate: {
      type: Number,
      min: 0,
      default: null,
    },

    vigorous: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const ActivityMetSchema = new mongoose.Schema(
  {
    activityType: {
      type: String,
      required: true,
      unique: true,
      index: true,
      enum: [
        "strength_training",
        "calisthenics",
        "cardio_machine",
        "hiit",
        "aerobic_dance",
        "yoga_stretching",
        "functional_training",
      ],
    },

    mets: {
      type: metLevelSchema,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const ActivityMet = mongoose.model(
  "ActivityMet",
  ActivityMetSchema,
  "activity_met"
);

module.exports = ActivityMet;