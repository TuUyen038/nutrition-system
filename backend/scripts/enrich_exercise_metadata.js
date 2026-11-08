const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

const { enrichExerciseMetadata } = require("../services/exerciseMetadata.service");

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

/**
 * Recompute difficulty / exerciseType / impactLevel / fatigueScore
 * for every exercise, without re-importing from wger.
 *
 * Run from the backend folder: node scripts/enrich_exercise_metadata.js
 */
async function run() {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("✅ Connected to MongoDB");

    const summary = await enrichExerciseMetadata();

    console.log("🎉 DONE:", JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();

    console.log("🔌 Disconnected MongoDB");
  }
}

run();
