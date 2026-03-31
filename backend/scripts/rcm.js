const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Recipe = require("../models/Recipe");

// ─────────────────────────────────────────────────────────────
// 1. CONFIGURATION (Giữ nguyên từ bản trước)
// ─────────────────────────────────────────────────────────────
const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.40, dinner: 0.35 };
const GOAL_PROFILES = {
    lose_weight: { cal_f: 0.85, p: 0.30, f: 0.25, c: 0.45 },
    gain_muscle: { cal_f: 1.10, p: 0.25, f: 0.25, c: 0.50 },
    balanced:    { cal_f: 1.00, p: 0.20, f: 0.30, c: 0.50 },
};
const NUTRITION_WEIGHTS = { calories: 2.5, protein: 2.0, fat: 1.0, carbs: 1.0 };
const TOTAL_W = Object.values(NUTRITION_WEIGHTS).reduce((a, b) => a + b, 0);

const MAX_CALO_PER_CAT = {
    main: 500,
    side_dish: 200,
    dessert: 120,
    light_supplement: 250,
    soup_veg: 150
};

// ─────────────────────────────────────────────────────────────
// 2. NUTRITION LOGIC (Giữ nguyên logic lõi)
// ─────────────────────────────────────────────────────────────
function getNormalizedScale(item) {
    const cat = item.category || "unknown";
    const rawCalories = parseFloat(item.nutri?.calories || 0);
    const threshold = MAX_CALO_PER_CAT[cat] || 9999;
    return rawCalories > threshold ? threshold / rawCalories : 1.0;
}

function getScaledNutri(item, scaleOverride = null) {
    const nutriData = item.nutri || {};
    const scale = scaleOverride !== null ? scaleOverride : getNormalizedScale(item);
    return {
        scaled: {
            calories: (nutriData.calories || 0) * scale,
            protein:  (nutriData.protein || 0) * scale,
            fat:      (nutriData.fat || 0) * scale,
            carbs:    (nutriData.carbs || 0) * scale
        },
        scale
    };
}

function gaussianScore(itemNutri, targetVec) {
    let sse = 0.0;
    for (const [key, w] of Object.entries(NUTRITION_WEIGHTS)) {
        const t = targetVec[key] || 1;
        const a = itemNutri[key] || 0;
        sse += w * Math.pow((a - t) / t, 2);
    }
    return Math.exp(-0.5 * sse / TOTAL_W);
}

// ─────────────────────────────────────────────────────────────
// 3. CORE FUNCTIONS (Sử dụng Set cho usedNames)
// ─────────────────────────────────────────────────────────────
function pickOne(pool, categoryInput, targetVec, usedNames, mealType) {
    const allowedCats = Array.isArray(categoryInput) ? categoryInput : [categoryInput];
    const subPool = pool.filter(r => allowedCats.includes(r.category));

    if (subPool.length === 0) return null;

    let scored = subPool.map(item => {
        const { scaled } = getScaledNutri(item);
        const fitScore = gaussianScore(scaled, targetVec);
        let penalty = (mealType === "dinner" && item.is_fried) ? 0.5 : 0.0;
        const finalScore = (0.7 * fitScore) + (0.3 * (!usedNames.has(item.name) ? 1.0 : 0.0)) - penalty;
        return { score: finalScore, item };
    });

    scored.sort((a, b) => b.score - a.score);
    const topN = Math.min(scored.length, 3);
    return scored[Math.floor(Math.random() * topN)].item;
}

// ─────────────────────────────────────────────────────────────
// 4. RUNNER (Đã chuyển sang Async để gọi MongoDB)
// ─────────────────────────────────────────────────────────────
async function runSystem(tdee = 2500, goal = "balanced") {
    try {
        // --- 1. Kết nối MongoDB ---
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Đã kết nối MongoDB thành công.");

        // --- 2. Lấy data và chuẩn hóa ---
        // Giả sử Model của bạn có totalNutritionPerServing
        const rawRecipes = await Recipe.find({}).lean();
        const recipes = rawRecipes.map(item => ({
            ...item,
            nutri: {
                calories: parseFloat(item.totalNutritionPerServing?.calories || 0),
                protein:  parseFloat(item.totalNutritionPerServing?.protein || 0),
                fat:      parseFloat(item.totalNutritionPerServing?.fat || 0),
                carbs:    parseFloat(item.totalNutritionPerServing?.carbs || 0),
            }
        })).filter(r => r.nutri.calories > 0);

        // --- 3. Thiết lập mục tiêu ngày ---
        const profile = GOAL_PROFILES[goal];
        const dailyCal = tdee * profile.cal_f;
        const dailyTarget = {
            calories: dailyCal,
            protein:  dailyCal * profile.p / 4,
            fat:      dailyCal * profile.f / 9,
            carbs:    dailyCal * profile.c / 4
        };

        let debt = { calories: 0, protein: 0, fat: 0, carbs: 0 };
        const usedNames = new Set();

        console.log(`\n--- MỤC TIÊU: ${goal.toUpperCase()} | TỔNG CALO: ${dailyCal.toFixed(0)} kcal ---`);

        // --- 4. Lặp qua các bữa ăn ---
        const meals = ["breakfast", "lunch", "dinner"];
        for (const mealKey of meals) {
            // Tính Target bữa ăn
            const baseTarget = {};
            for (let k in dailyTarget) baseTarget[k] = dailyTarget[k] * MEAL_SPLIT[mealKey];
            
            // Điều chỉnh nợ (Rolling Debt)
            const adjTarget = {};
            for (let k in baseTarget) {
                const maxAdj = baseTarget[k] * 0.2;
                const adjVal = Math.max(-maxAdj, Math.min(maxAdj, (debt[k] || 0) / 2));
                adjTarget[k] = baseTarget[k] + adjVal;
            }

            // --- LÔGIC CHỌN MÓN (Build Meal) ---
            // Ở đây tôi viết gọn lại logic build_complete_meal vào vòng lặp để bạn dễ soi console
            let chosen = [];
            if (mealKey === "breakfast") {
                const res = pickOne(recipes, ["one_dish_meal"], adjTarget, usedNames, mealKey);
                if (res) chosen.push(res);
            } else {
                // Giả lập Combo vs One-dish
                const s = pickOne(recipes, ["base_starch"], { calories: adjTarget.calories * 0.4 }, usedNames, mealKey);
                const m = pickOne(recipes, ["main"], { calories: adjTarget.calories * 0.4 }, usedNames, mealKey);
                const v = pickOne(recipes, ["soup_veg"], { calories: adjTarget.calories * 0.2 }, usedNames, mealKey);
                chosen = [s, m, v].filter(Boolean);
            }

            // Tính thực tế và in kết quả
            const actual = { calories: 0, protein: 0, fat: 0, carbs: 0 };
            console.log(`\n[Bữa ${mealKey}] Dự kiến: ${adjTarget.calories.toFixed(0)}kcal`);
            
            chosen.forEach(r => {
                const { scaled, scale } = getScaledNutri(r);
                for (let k in actual) actual[k] += scaled[k];
                usedNames.add(r.name);
                console.log(` - ${r.name} (Scale: x${scale.toFixed(2)}) -> ${scaled.calories.toFixed(0)} kcal`);
            });

            // Cập nhật nợ
            for (let k in debt) debt[k] = (debt[k] || 0) + (baseTarget[k] - actual[k]);
            console.log(` 👉 Tổng bữa: ${actual.calories.toFixed(1)}kcal | Nợ tích lũy: ${debt.calories.toFixed(1)}kcal`);
        }

    } catch (err) {
        console.error("❌ Lỗi hệ thống:", err);
    } finally {
        await mongoose.connection.close();
        console.log("\n🔌 Đã đóng kết nối MongoDB.");
    }
}

// Thực thi
runSystem(2500, "gain_muscle");