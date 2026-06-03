const mongoose = require("mongoose");

const ExerciseSchema = new mongoose.Schema(
  {
    exerciseId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    categoryId: {
      type: Number,
      default: null,
    },
    category: {
      type: String,
      default: "",
    },
    muscles: {
      type: [
        {
          id: Number,
          name: String,
          name_en: String,
        },
      ],
      default: [],
    },
    muscles_secondary: {
      type: [
        {
          id: Number,
          name: String,
          name_en: String,
        },
      ],
      default: [],
    },
    equipment: {
      type: [
        {
          id: Number,
          name: String,
        },
      ],
      default: [],
    },
    images: {
      type: [String],
      default: [],
    },
    activityType: {
      type: String,
      enum: [
        "strength_training",
        "calisthenics",
        "cardio_machine",
        "hiit",
        "aerobic_dance",
        "yoga_stretching",
        "functional_training"
      ],
      default: "strength_training",
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
    },
    exerciseType: {
      type: String,
      enum: [
        "compound",
        "isolation",
        "cardio",
        "mobility",
        "stretching",
      ],
    },
    impactLevel: {
      type: String,
      enum: ["low", "medium", "high"],
    },
    fatigueScore: Number,
    suitableGoals: [String],
    avoidFor: [String],
    videos: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Exercise = mongoose.model("Exercise", ExerciseSchema);

module.exports = Exercise;
