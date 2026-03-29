const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Exercise = require("../models/Exercise");
const ActivityMet = require("../models/ActivityMet");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

/**
 * ✅ FINAL activity_met DATA
 */
const activityMetDocs = [
  // 🏋️ strength training
  { activityType: "strength_training", intensity: "light", met: 3.5 },
  { activityType: "strength_training", intensity: "moderate", met: 5.0 },
  { activityType: "strength_training", intensity: "vigorous", met: 6.0 },

  // 🤸 calisthenics
  { activityType: "calisthenics", intensity: "light", met: 2.8 },
  { activityType: "calisthenics", intensity: "moderate", met: 3.8 },
  { activityType: "calisthenics", intensity: "vigorous", met: 7.5 },

  // 🏃 cardio machine
  { activityType: "cardio_machine", intensity: "light", met: 4.0 },
  { activityType: "cardio_machine", intensity: "moderate", met: 7.0 },
  { activityType: "cardio_machine", intensity: "vigorous", met: 10.0 },

  // 🔥 HIIT - High-Intensity Interval Training
  { activityType: "hiit", intensity: "moderate", met: 7.0 },
  { activityType: "hiit", intensity: "vigorous", met: 10.0 },

  // 💃 aerobic dance
  { activityType: "aerobic_dance", intensity: "light", met: 4.8 },
  { activityType: "aerobic_dance", intensity: "moderate", met: 6.5 },
  { activityType: "aerobic_dance", intensity: "vigorous", met: 8.0 },

  // 🧘 yoga / stretching
  { activityType: "yoga_stretching", intensity: "light", met: 2.3 },
  { activityType: "yoga_stretching", intensity: "moderate", met: 3.0 },

  // 🧩 functional training
  { activityType: "functional_training", intensity: "light", met: 3.5 },
  { activityType: "functional_training", intensity: "moderate", met: 5.5 },
  { activityType: "functional_training", intensity: "vigorous", met: 7.5 }
];

/**
 * 🎯 Mapping activityType
 */
function inferActivityType(exercise) {
  const name = String(exercise.name || "").toLowerCase();
  const category = String(exercise.category || "").toLowerCase();
  const equipment = exercise.equipment || [];

  // 1. Cardio
  if (category === "cardio") return "cardio_machine";

  // 2. Yoga / stretching
  if (
    name.includes("yoga") ||
    name.includes("stretch") ||
    name.includes("pilates")
  ) {
    return "yoga_stretching";
  }

  // 3. HIIT
  if (
    name.includes("jump") ||
    name.includes("burpee") ||
    name.includes("mountain climber") ||
    name.includes("high knees") ||
    name.includes("tabata")
  ) {
    return "hiit";
  }

  // 4. Aerobic dance
  if (
    name.includes("zumba") ||
    name.includes("dance") ||
    name.includes("aerobic")
  ) {
    return "aerobic_dance";
  }

  // 5. Functional / circuit
  if (
    name.includes("circuit") ||
    name.includes("crossfit") ||
    name.includes("full body")
  ) {
    return "functional_training";
  }

  // 6. Bodyweight
  if (!Array.isArray(equipment) || equipment.length === 0) {
    return "calisthenics";
  }

  // 7. Default
  return "strength_training";
}

/**
 * 🎯 Default intensity (UX tốt hơn)
 */
function getDefaultIntensity(type) {
  switch (type) {
    case "hiit":
      return "vigorous";
    case "yoga_stretching":
      return "light";
    default:
      return "moderate";
  }
}

/**
 * ✅ Seed activity_met
 */
async function seedActivityMet() {
  await ActivityMet.deleteMany({});
  await ActivityMet.insertMany(activityMetDocs, { ordered: true });

  console.log(`✅ Seeded ${activityMetDocs.length} activity_met documents`);
}

/**
 * ✅ Assign activityType + defaultIntensity
 */
async function assignActivityTypeToExercises() {
  const exercises = await Exercise.find(
    {},
    { _id: 1, name: 1, category: 1, equipment: 1 }
  ).lean();

  if (!exercises.length) {
    console.log("ℹ️ No exercises found");
    return;
  }

  const bulkOperations = exercises.map((exercise) => {
    const activityType = inferActivityType(exercise);
    const defaultIntensity = getDefaultIntensity(activityType);

    return {
      updateOne: {
        filter: { _id: exercise._id },
        update: {
          $set: {
            activityType,
            defaultIntensity
          }
        }
      }
    };
  });

  const result = await Exercise.bulkWrite(bulkOperations, {
    ordered: false
  });

  console.log(`✅ Updated ${result.modifiedCount || 0} exercises`);
}

/**
 * 🚀 MAIN
 */
async function run() {
  await mongoose.connect(MONGO_URI);

  console.log("✅ Connected to MongoDB");

  try {
    await seedActivityMet();
    await assignActivityTypeToExercises();

    console.log("🎉 DONE: activity_met + activityType assigned");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected MongoDB");
  }
}

run();