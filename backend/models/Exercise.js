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
