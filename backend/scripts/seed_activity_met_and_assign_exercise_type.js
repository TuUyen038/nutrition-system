const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

const Exercise = require("../models/Exercise");
const ActivityMet = require("../models/ActivityMet");

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

/**
 * Schema activity_met DATA
 * {
 *   activityType,
 *   mets: {
 *     light?,
 *     moderate?,
 *     vigorous?
 *   }
 * }
 */
const activityMetDocs = [
  // Strength training
  {
    activityType: "strength_training",

    mets: {
      light: 3.5,
      moderate: 5.0,
      vigorous: 6.0,
    },
  },

  // Calisthenics
  {
    activityType: "calisthenics",

    mets: {
      light: 2.8,
      moderate: 3.8,
      vigorous: 7.5,
    },
  },

  // Cardio machine
  {
    activityType: "cardio_machine",

    mets: {
      light: 4.0,
      moderate: 7.0,
      vigorous: 10.0,
    },
  },

  // HIIT
  {
    activityType: "hiit",

    mets: {
      moderate: 7.0,
      vigorous: 10.0,
    },
  },

  // Aerobic dance
  {
    activityType: "aerobic_dance",

    mets: {
      light: 4.8,
      moderate: 6.5,
      vigorous: 8.0,
    },
  },

  // Yoga / stretching
  {
    activityType: "yoga_stretching",

    mets: {
      light: 2.3,
      moderate: 3.0,
    },
  },

  // Functional training
  {
    activityType: "functional_training",

    mets: {
      light: 3.5,
      moderate: 5.5,
      vigorous: 7.5,
    },
  },
];

/**
 * 🎯 Infer activityType
 */
function inferActivityType(exercise) {
  const name = String(exercise.name || "").toLowerCase();

  const category = String(
    exercise.category || ""
  ).toLowerCase();

  const equipment = exercise.equipment || [];

  // 1. Cardio
  if (category === "cardio") {
    return "cardio_machine";
  }

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

  // 5. Functional training
  if (
    name.includes("circuit") ||
    name.includes("crossfit") ||
    name.includes("full body")
  ) {
    return "functional_training";
  }

  // 6. Calisthenics / bodyweight
  if (
    !Array.isArray(equipment) ||
    equipment.length === 0
  ) {
    return "calisthenics";
  }

  // 7. Default
  return "strength_training";
}

/**
 * ✅ Seed activity_met
 */
async function seedActivityMet() {
  await ActivityMet.deleteMany({});

  await ActivityMet.insertMany(
    activityMetDocs,
    {
      ordered: true,
    }
  );

  console.log(
    `✅ Seeded ${activityMetDocs.length} activity_met documents`
  );
}

/**
 * ✅ Assign activityType 
 */
async function assignActivityTypeToExercises() {
  const exercises = await Exercise.find(
    {},
    {
      _id: 1,
      name: 1,
      category: 1,
      equipment: 1,
    }
  ).lean();

  if (!exercises.length) {
    console.log("ℹ️ No exercises found");
    return;
  }

  const bulkOperations = exercises.map(
    (exercise) => {
      const activityType =
        inferActivityType(exercise);

      return {
        updateOne: {
          filter: {
            _id: exercise._id,
          },

          update: {
            $set: {
              activityType,
            },
          },
        },
      };
    }
  );

  const result = await Exercise.bulkWrite(
    bulkOperations,
    {
      ordered: false,
    }
  );

  console.log(
    `✅ Updated ${result.modifiedCount || 0} exercises`
  );
}

/**
 * 🚀 MAIN
 */
async function run() {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("✅ Connected to MongoDB");

    await seedActivityMet();

    await assignActivityTypeToExercises();

    console.log(
      "🎉 DONE: activity_met + activityType assigned"
    );
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();

    console.log("🔌 Disconnected MongoDB");
  }
}

run();