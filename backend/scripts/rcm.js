const mongoose = require("mongoose");
const path = require("path");

// Load cấu hình từ file .env (nằm ở thư mục cha của thư mục chứa script này)
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Recipe = require("../models/Recipe");

// ─────────────────────────────────────────────────────────────
// 1. CẤU HÌNH & HẰNG SỐ (CONFIG)
// ─────────────────────────────────────────────────────────────

const GOAL_PROFILES = {
    lose_weight: { label: "Giảm cân", cal_f: 0.85, p: 0.30, f: 0.25, c: 0.45 },
    gain_muscle: { label: "Tăng cơ", cal_f: 1.10, p: 0.25, f: 0.25, c: 0.50 },
    balanced:    { label: "Cân bằng", cal_f: 1.00, p: 0.20, f: 0.30, c: 0.50 },
};

const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.40, dinner: 0.35 };
const MEAL_LABEL = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối" };

// Trọng số ưu tiên khi tính điểm (Calories và Protein quan trọng nhất)
const NUTRITION_WEIGHTS = { calories: 2.5, protein: 2.0, fat: 1.0, carbs: 1.0 };
const TOTAL_W = Object.values(NUTRITION_WEIGHTS).reduce((a, b) => a + b, 0);

// Ngưỡng Calo tối đa cho từng loại món ăn để thực hiện Auto-scaling (Ví dụ: tránh ăn 1 đĩa Ngô chiên 800kcal)
const MAX_CALO_PER_CAT = {
    main: 1000,
    side_dish: 200,
    dessert: 150,
    light_supplement: 200,
    soup_veg: 150,
    base_starch: 800, // Cơm/Bún trắng
    one_dish_meal: 900
};

// ─────────────────────────────────────────────────────────────
// 2. CÁC HÀM TÍNH TOÁN DINH DƯỠNG (CORE LOGIC)
// ─────────────────────────────────────────────────────────────

/**
 * Tính toán tỷ lệ scale dựa trên ngưỡng calo của Category
 */
function getNormalizedScale(recipe) {
    const cat = recipe.category || "unknown";
    const rawCalories = recipe.totalNutritionPerServing?.calories || 0;
    const threshold = MAX_CALO_PER_CAT[cat] || 9999;
    return rawCalories > threshold ? threshold / rawCalories : 1.0;
}

/**
 * Lấy dinh dưỡng sau khi đã scale (ví dụ: chỉ ăn 0.5 suất nếu món quá béo)
 */
function getScaledNutri(recipe, scaleOverride = null) {
    const nutri = recipe.totalNutritionPerServing || {};
    const scale = scaleOverride !== null ? scaleOverride : getNormalizedScale(recipe);

    return {
        nutri: {
            calories: (nutri.calories || 0) * scale,
            protein:  (nutri.protein || 0) * scale,
            fat:      (nutri.fat || 0) * scale,
            carbs:    (nutri.carbs || 0) * scale,
        },
        scale
    };
}

/**
 * Gaussian Score: So sánh độ lệch giữa món ăn và mục tiêu bữa ăn
 */
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
// 3. BỘ MÁY GỢI Ý (RECOMMENDATION ENGINE)
// ─────────────────────────────────────────────────────────────

function pickOne(pool, categoryInput, targetVec, usedNames, mealType) {
    const allowedCats = Array.isArray(categoryInput) ? categoryInput : [categoryInput];
    const subPool = pool.filter(r => allowedCats.includes(r.category));

    if (subPool.length === 0) return null;

    const scored = subPool.map(recipe => {
        const { nutri } = getScaledNutri(recipe);
        const fitScore = gaussianScore(nutri, targetVec);
        
        // Phạt nhẹ các món có dầu mỡ/chiên rán vào buổi tối (dựa trên tên hoặc mô tả)
        let penalty = 0.0;
        const searchStr = (recipe.name + (recipe.description || "")).toLowerCase();
        if (mealType === "dinner" && (searchStr.includes("chiên") || searchStr.includes("rán"))) {
            penalty = 0.2;
        }

        const isUsed = usedNames.has(recipe.name.toLowerCase().trim());
        const varietyScore = isUsed ? 0.0 : 1.0;
        
        return { 
            finalScore: (0.7 * fitScore) + (0.3 * varietyScore) - penalty, 
            recipe 
        };
    });

    scored.sort((a, b) => b.finalScore - a.finalScore);
    const topN = Math.min(scored.length, 3);
    return scored[Math.floor(Math.random() * topN)].recipe;
}

function buildCompleteMeal(recipes, mealType, target, usedNames, forceCombo = false) {
    let chosen = [];

    if (mealType === "breakfast") {
        // Sáng: Ưu tiên One-dish (Phở, Bún, Mỳ)
        const res = pickOne(recipes, ["one_dish_meal"], target, usedNames, mealType);
        if (res) chosen.push(res);
    } else {
        // Tạo khung Combo (Cơm + Mặn + Canh)
        const s = pickOne(recipes, ["base_starch"], { ...target, calories: target.calories * 0.4 }, usedNames, mealType);
        const m = pickOne(recipes, ["main"], { ...target, calories: target.calories * 0.4 }, usedNames, mealType);
        const v = pickOne(recipes, ["soup_veg"], { ...target, calories: target.calories * 0.2 }, usedNames, mealType);
        const combo = [s, m, v].filter(Boolean);

        // Tạo khung One-dish (Bún đậu, Phở...)
        const oneDish = pickOne(recipes, ["one_dish_meal"], target, usedNames, mealType);
        const oneDishArr = oneDish ? [oneDish] : [];

        // Logic So găng (Duel) giữa Cơm và One-dish
        if (forceCombo) {
            chosen = combo;
        } else {
            // Thưởng điểm cho Combo (cơm) để ưu tiên bữa ăn gia đình truyền thống
            const scoreCombo = combo.length >= 2 ? 1.2 : 0; 
            const scoreOne = oneDishArr.length > 0 ? 1.0 : 0;
            chosen = scoreCombo >= scoreOne ? combo : oneDishArr;
        }
    }

    chosen.forEach(r => usedNames.add(r.name.toLowerCase().trim()));
    return chosen;
}

// ─────────────────────────────────────────────────────────────
// 4. LOGIC ĐIỀU CHỈNH THÔNG MINH (ADAPTIVE / DEBT)
// ─────────────────────────────────────────────────────────────

function getDailyTarget(tdee, goal) {
    const p = GOAL_PROFILES[goal] || GOAL_PROFILES.balanced;
    const cal = tdee * p.cal_f;
    return {
        calories: cal,
        protein:  (cal * p.p) / 4,
        fat:      (cal * p.f) / 9,
        carbs:    (cal * p.c) / 4
    };
}

/**
 * Rolling Debt: Điều chỉnh target hôm nay dựa trên những gì đã ăn hôm qua/hôm kia
 */
function adjustTarget(dt, history, smoothing = 2) {
    const recent = history.slice(-3); // Xét 3 ngày gần nhất
    const adjusted = { ...dt };
    
    ["calories", "protein", "fat", "carbs"].forEach(k => {
        const consumed = recent.reduce((sum, day) => sum + (day[k] || 0), 0);
        const debt = (dt[k] * recent.length) - consumed;
        
        const maxAdj = dt[k] * 0.2; // Không điều chỉnh quá 20% tránh sốc calo
        const adjVal = Math.max(-maxAdj, Math.min(maxAdj, debt / smoothing));
        adjusted[k] += adjVal;
    });
    return adjusted;
}

// ─────────────────────────────────────────────────────────────
// 5. THỰC THI (MAIN EXECUTION)
// ─────────────────────────────────────────────────────────────

async function main() {
    try {
        console.log("🚀 Đang kết nối tới Database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Kết nối MongoDB thành công.");

        // 1. Tải toàn bộ Recipe hợp lệ vào bộ nhớ
        const recipes = await Recipe.find({
            deleted: { $ne: true },
            "totalNutritionPerServing.calories": { $gt: 0 }
        }).lean();

        if (recipes.length === 0) {
            console.log("❌ Không có dữ liệu món ăn hợp lệ trong DB.");
            return;
        }

        const TDEE = 2500;
        const GOAL = "gain_muscle"; // Thử nghiệm mục tiêu tăng cơ
        const baseDt = getDailyTarget(TDEE, GOAL);

        // 2. Giả lập lịch sử: Người dùng ăn thiếu hụt Calo và Protein trong 3 ngày qua
        const history = [
            { calories: baseDt.calories * 0.8, protein: baseDt.protein * 0.5, fat: baseDt.fat, carbs: baseDt.carbs },
            { calories: baseDt.calories * 0.9, protein: baseDt.protein * 0.6, fat: baseDt.fat, carbs: baseDt.carbs },
            { calories: baseDt.calories * 0.85, protein: baseDt.protein * 0.7, fat: baseDt.fat, carbs: baseDt.carbs }
        ];

        // 3. Tính target sau khi đã bù nợ (Adaptive)
        const adjDt = adjustTarget(baseDt, history);

        console.log(`\n${"=".repeat(60)}`);
        console.log(`KẾ HOẠCH DINH DƯỠNG: ${GOAL_PROFILES[GOAL].label.toUpperCase()}`);
        console.log(`TDEE: ${TDEE} kcal | Target Gốc: ${baseDt.calories.toFixed(0)} kcal`);
        console.log(`Target Điều Chỉnh (Bù nợ): ${adjDt.calories.toFixed(0)} kcal | Protein: ${adjDt.protein.toFixed(1)}g`);
        console.log(`${"=".repeat(60)}\n`);

        const usedNames = new Set();
        let dayActual = { calories: 0, protein: 0, fat: 0, carbs: 0 };

        // 4. Gợi ý cho 3 bữa ăn
        for (const mKey of ["breakfast", "lunch", "dinner"]) {
            // Tính target riêng cho bữa này
            const mTarget = Object.fromEntries(
                Object.entries(adjDt).map(([k, v]) => [k, v * MEAL_SPLIT[mKey]])
            );
            
            // Logic: Nếu trưa ăn One-dish (Bún/Phở) thì tối ép ăn Combo (Cơm) cho cân bằng
            const isLunchOneDish = mKey === "dinner" && Array.from(usedNames).some(n => n.includes("phở") || n.includes("bún"));
            
            const mealItems = buildCompleteMeal(recipes, mKey, mTarget, usedNames, isLunchOneDish);
            
            console.log(`▶ Bữa ${MEAL_LABEL[mKey]} (Target: ${mTarget.calories.toFixed(0)} kcal):`);
            
            if (mealItems.length === 0) {
                console.log("   (Không tìm thấy món phù hợp)");
                continue;
            }

            mealItems.forEach(it => {
                const { nutri, scale } = getScaledNutri(it);
                console.log(`   - [${it.category.padEnd(12)}] ${it.name.padEnd(30)} (x${scale.toFixed(2)}) | Calo: ${nutri.calories.toFixed(1)}`);
                
                dayActual.calories += nutri.calories;
                dayActual.protein += nutri.protein;
                dayActual.fat += nutri.fat;
                dayActual.carbs += nutri.carbs;
            });
            console.log("");
        }

        // 5. Tổng kết
        console.log("-".repeat(60));
        console.log(`TỔNG CỘNG THỰC TẾ: Calo=${dayActual.calories.toFixed(0)}, Protein=${dayActual.protein.toFixed(1)}g`);
        console.log(`MỤC TIÊU CẦN ĐẠT : Calo=${adjDt.calories.toFixed(0)}, Protein=${adjDt.protein.toFixed(1)}g`);
        console.log("-".repeat(60));

    } catch (err) {
        console.error("❌ Lỗi hệ thống:", err);
    } finally {
        await mongoose.disconnect();
        console.log("\n🔌 Đã ngắt kết nối Database.");
    }
}

// Chạy script
main();