const mongoose = require("mongoose");
const Recipe = require("../models/Recipe");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const DRI_PER_MEAL = {
  calories: 2000 / 3,
  protein:  50   / 3,
  fat:      65   / 3,
  carbs:    260  / 3,
  fiber:    25   / 3,
};

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}
function buildVector(nutrition) {
  return ["calories", "protein", "fat", "carbs", "fiber"].map((k) =>
    +((nutrition[k] ?? 0) / DRI_PER_MEAL[k]).toFixed(4)
  );
}

async function run() {
  await mongoose.connect(MONGO_URI);

  const recipes = await Recipe.find({
    "totalNutritionPerServing.calories": { $gt: 0 },
    nutritionVector: { $exists: false },
  }).lean();

  console.log(`Found ${recipes.length} recipes to update`);

  if (recipes.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const ops = recipes.map((r) => ({
    updateOne: {
      filter: { _id: r._id },
      update: {
        $set: {
          nutritionVector: buildVector(r.totalNutritionPerServing),
        },
      },
    },
  }));

  const result = await Recipe.bulkWrite(ops);
  console.log(`✅ Updated: ${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch(console.error);