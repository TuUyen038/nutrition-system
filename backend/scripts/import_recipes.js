const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Recipe = require("../models/Recipe");

// ---------- Mongo connect ----------
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

// ---------- helpers ----------
function convertDate(dateStr) {
  if (!dateStr) return null;

  const [day, month, year] = dateStr.split("-");

  return new Date(`${year}-${month}-${day}`);
}

// // ---------- import ----------
// async function importRecipes() {
//   await mongoose.connect(MONGO_URI);

//   console.log("✅ Connected to MongoDB");

//   try {
//     const filePath = path.join(
//       __dirname,
//       "../crawler/savoury/data/recipes.json",
//     );

//     const raw = fs.readFileSync(filePath);

//     const recipes = JSON.parse(raw);

//     console.log(`📄 Loaded ${recipes.length} recipes`);

//     // transform data
//     const transformed = recipes.map((r) => ({
//       ...r,
//       servings: r.serving ?? null,

//       date: convertDate(r.date),
//       // ✅ Normalize quantity structure
//       ingredients: (r.ingredients || []).map((ing) => {
//         const raw = ing.name;
//         return {
//           ...ing,

//           // lưu name JSON thành cả name và rawName
//           name: raw,
//           rawName: raw,
//           quantity: {
//             amount: ing.quantity?.amount ?? 0,
//             unit: ing.quantity?.unit ?? "g",
//             originalAmount:
//               ing.quantity?.originalAmount ?? ing.quantity?.amount ?? 0,
//             originalUnit:
//               ing.quantity?.originalUnit ?? ing.quantity?.unit ?? "g",
//           },
//         };
//       }),
//     }));

//     // insertMany
//     try {
//       const result = await Recipe.insertMany(transformed, {
//         ordered: false,
//       });

//       console.log(`✅ Inserted ${result.length} recipes`);
//     } catch (err) {
//       console.log("⚠️ Some recipes failed");

//       if (err.writeErrors) {
//         err.writeErrors.forEach((e) => {
//           const doc = e.err.op;

//           const log = {
//             title: doc.title,
//             detailUrl: doc.detailUrl,
//             error: e.errmsg,
//           };

//           console.log(`❌ FAILED: ${doc.title}`);

//           fs.appendFileSync(
//             path.join(__dirname, "recipe-import-errors.log"),
//             JSON.stringify(log) + "\n",
//           );
//         });
//       }
//     }
//   } catch (err) {
//     console.error("❌ Fatal error:", err);
//   } finally {
//     await mongoose.disconnect();

//     console.log("🔌 Disconnected MongoDB");
//   }
// }
// đay la import Savoury
// importRecipes();


// ---------- Config ----------
const JSON_FILE_PATH = path.join(__dirname, "../recipeVdd.json");
const BASE_IMAGE_URL = "https://viendinhduong.vn";

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

// ---------- Helpers ----------
function buildImageUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return BASE_IMAGE_URL + imagePath;
}

/**
 * Phục hồi các giá trị dinh dưỡng null về 0
 */
function cleanNutrition(nutri) {
  if (!nutri) return {};
  return {
    calories: nutri.calories ?? 0,
    protein: nutri.protein ?? 0,
    fat: nutri.fat ?? 0,
    carbs: nutri.carbs ?? 0,
    fiber: nutri.fiber ?? 0,   // Phục hồi Fiber null -> 0
    sugar: nutri.sugar ?? 0,   // Phục hồi Sugar null -> 0
    sodium: nutri.sodium ?? 0
  };
}

// ---------- Main ----------
async function importData() {
  try {
    // 1. Kết nối DB
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // 2. Đọc file JSON
    if (!fs.existsSync(JSON_FILE_PATH)) {
      throw new Error(`File not found at ${JSON_FILE_PATH}`);
    }
    const raw = fs.readFileSync(JSON_FILE_PATH, "utf-8");
    const data = JSON.parse(raw);
    console.log(`📄 Found ${data.length} records in JSON`);

    // 3. Xóa dữ liệu cũ của nguồn viendinhduong
    const deleteResult = await Recipe.deleteMany({ source: "viendinhduong" });
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} old "viendinhduong" records`);

    // 4. Transform & Dedup logic
    const seen = new Set();
    const docs = [];

    for (const item of data) {
      const nutri = item.totalNutritionPerServing || {};
      const cal = nutri.calories || 0;
      
      // Tạo key để kiểm tra trùng lặp (Tên chuẩn hóa + Calo)
      const nameNorm = item.name.trim().toLowerCase();
      const dedupKey = `${nameNorm}_${cal}`;

      // Logic loại bỏ nếu trùng Tên và Calo
      if (seen.has(dedupKey)) {
        continue; // Bỏ qua món này
      }
      seen.add(dedupKey);

      // Phục hồi các trường nutrition bị thiếu/null
      const cleanedNutri = cleanNutrition(item.totalNutritionPerServing);

      docs.push({
        name: item.name,
        totalWeight: item.totalWeight || null,
        source: "viendinhduong",
        sourceMetadata: {
          code: item.vddCode,
          id: item.vddId,
        },
        version: item.version || 2,
        category: item.category,
        description: item.description || null,
        instructions: item.instructions || [],
        ingredients: item.ingredients || [],
        servings: item.servings || 1,
        
        // Cập nhật lại nutrition đã sạch null
        totalNutritionPerServing: cleanedNutri,
        
        // Giữ nguyên Vector từ file JSON (không tính toán lại)
        nutritionVector: item.nutritionVector || [0, 0, 0, 0, 0],

        imageUrl: buildImageUrl(item.imageUrl),
        createdBy: item.createdBy || "admin",
        verified: true,
        deleted: false,
        allergy_tags: item.allergy_tags || [],
        updatedAt: new Date()
      });
    }

    console.log(`✨ After dedup, remaining: ${docs.length} recipes`);

    // 5. Insert vào DB
    if (docs.length > 0) {
      const result = await Recipe.insertMany(docs, { ordered: false });
      console.log(`🚀 Import thành công ${result.length} món ăn!`);
    } else {
      console.log("⚠️ No records to import.");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Import failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// ---------- Run ----------
importData();