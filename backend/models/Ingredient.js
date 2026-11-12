const mongoose = require("mongoose");

const externalRefSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["usda_fdc", "edamam", "openfoodfacts", "fatsecret", "other", "VTN_FCT_2007"],
      required: true,
    },
    external_id: { type: String}, // e.g. USDA fdcId

    confidence: { type: Number, min: 0, max: 1, default: 0 },
    data_type: { type: String, default: "" }, // e.g. USDA: Foundation, SR Legacy, Branded...
    url: { type: String, default: "" },
    last_synced_at: { type: Date, default: null },
  },
  { _id: false }
);

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    name_en: { type: String, trim: true },
    nutrition: {
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
    },
    aliases: { type: [String], default: [] },

    unit: { type: String, default: "g" },
    category: {
      type: String,
      enum: [
        "protein",
        "carb",
        "fat",
        "vegetable",
        "fruit",
        "dairy",
        "seasoning",
        "beverage",
        "other",
      ],
      default: "other",
    },
    source: { type: String, default: "other" },
    external_refs: { type: [externalRefSchema], default: [] },
  },
  { timestamps: true }
);

// giúp tránh trùng external mapping (optional nhưng nên có)
ingredientSchema.index(
  { "external_refs.provider": 1, "external_refs.external_id": 1 },
  { sparse: true }
);
ingredientSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Ingredient", ingredientSchema);
