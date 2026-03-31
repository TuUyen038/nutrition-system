const mongoose = require("mongoose");
const Recipe = require("../models/Recipe");
const { calculateRecipeNutrition } = require("../utils/calculateRecipeNutrition");

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const DRI_PER_MEAL = {
  calories: 2000 / 3,
  protein: 50 / 3,
  fat: 65 / 3,
  carbs: 260 / 3,
  fiber: 25 / 3,
};

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

function buildVector(nutrition) {
  if (!nutrition) return [0, 0, 0, 0, 0];
  return ["calories", "protein", "fat", "carbs", "fiber"].map((k) =>
    +((nutrition[k] ?? 0) / DRI_PER_MEAL[k]).toFixed(4)
  );
}

async function migrateAndVectorize() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("🚀 Connected to MongoDB...");

    // 1. Tìm các món có sử dụng 'role' (Dùng $elemMatch như bạn đã test thành công)
    const query = {
      ingredients: {
        $elemMatch: { role: { $exists: true, $ne: null } }
      }
    };

    const recipesToUpdate = await Recipe.find(query);
    console.log(`📊 Tổng số món có 'role' cần cập nhật: ${recipesToUpdate.length}`);

    if (recipesToUpdate.length === 0) {
      console.log("No recipes found to update.");
      return;
    }

    let ops = [];
    let successCount = 0;

    for (let i = 0; i < recipesToUpdate.length; i++) {
      const r = recipesToUpdate[i];

      // In tên món ra terminal để theo dõi
      console.log(`[${i + 1}/${recipesToUpdate.length}] Processing: ${r.name}`);

      // 2. Tính toán lại Nutrition theo logic absorptionRate
      const updatedNutri = await calculateRecipeNutrition(r.ingredients, r.servings);

      // 3. Build vector dựa trên kết quả perServing mới
      const newVector = buildVector(updatedNutri.totalNutritionPerServing);

      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: {
            $set: {
              totalNutrition: updatedNutri.totalNutrition,
              totalNutritionPer100g: updatedNutri.totalNutritionPer100g,
              totalNutritionPerServing: updatedNutri.totalNutritionPerServing,
              totalWeight: updatedNutri.totalWeight,
              nutritionVector: newVector,
              version: (r.version || 0) + 1
            },
          },
        },
      });

      // 4. Thực thi bulkWrite mỗi khi đủ 100 bản ghi
      if (ops.length === 100) {
        const result = await Recipe.bulkWrite(ops);
        successCount += result.modifiedCount;
        console.log(`--- ✅ Đã lưu 100 món vào Database ---`);
        ops = [];
      }
    }

    // Xử lý nốt các bản ghi còn lại trong mảng ops
    if (ops.length > 0) {
      const result = await Recipe.bulkWrite(ops);
      successCount += result.modifiedCount;
    }

    console.log(`\n🎉 Hoàn tất! Đã cập nhật thành công ${successCount} món ăn.`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
  }
}

migrateAndVectorize();