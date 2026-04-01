const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });
const Recipe = require("../models/Recipe");

// --- CONFIG & CONSTANTS (Giữ nguyên từ code của bạn) ---
const GOAL_PROFILES = {
  lose_weight: { label: "Giảm cân", cal_f: 0.85, p: 0.3, f: 0.25, c: 0.45 },
  gain_muscle: { label: "Tăng cơ", cal_f: 1.1, p: 0.25, f: 0.25, c: 0.5 },
  balanced: { label: "Cân bằng", cal_f: 1.0, p: 0.2, f: 0.3, c: 0.5 },
};
// Thêm danh sách các từ khóa gây "nặng bụng" buổi tối
const NIGHT_BLACKLIST = ["xôi", "nếp", "chiên", "rán", "quay"];

// Điều chỉnh lại MEAL_SPLIT để bữa tối nhẹ hơn một chút nếu muốn
const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.45, dinner: 0.3 };
const MEAL_LABEL = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối" };
const NUTRITION_WEIGHTS = { calories: 2.5, protein: 2.0, fat: 1.0, carbs: 1.0 };
const TOTAL_W = Object.values(NUTRITION_WEIGHTS).reduce((a, b) => a + b, 0);
const MAX_CALO_PER_CAT = {
  main: 600,
  side_dish: 200,
  dessert: 150,
  light_supplement: 200,
  soup_veg: 150,
  base_starch: 300,
  one_dish_meal: 700,
};

// --- CORE UTILS (Các hàm bổ trợ tính toán) ---

/**
 * Hàm kiểm tra món ăn có phù hợp cho buổi tối không
 */
function isHeavyForDinner(recipe) {
  const searchStr = (
    recipe.name +
    " " +
    (recipe.description || "")
  ).toLowerCase();
  return NIGHT_BLACKLIST.some((word) => searchStr.includes(word));
}

function getScaledNutri(recipe) {
  const cat = recipe.category || "unknown";
  const rawNutri = recipe.totalNutritionPerServing || {};
  const rawCalo = rawNutri.calories || 0;

  // Lấy ngưỡng tối đa cho phép của loại món này
  const threshold = MAX_CALO_PER_CAT[cat] || 500;

  // Tính toán scale để món ăn không vượt quá ngưỡng
  // Ví dụ: Khoai 707kcal, threshold 300kcal => scale = 300/707 = 0.42
  let scale = rawCalo > threshold ? threshold / rawCalo : 1.0;

  // GIỚI HẠN CỨNG:
  // Một món ăn dù hệ thống có "vã" calo đến mấy cũng không được ăn quá 1.5 lần
  // hoặc nếu món gốc quá to thì không được ăn quá tỉ lệ threshold.
  // Điều này ngăn việc hệ thống bắt bạn ăn x2.0 đĩa khoai 707kcal.
  scale = Math.min(scale, 1.2);

  return {
    nutri: {
      calories: (rawNutri.calories || 0) * scale,
      protein: (rawNutri.protein || 0) * scale,
      fat: (rawNutri.fat || 0) * scale,
      carbs: (rawNutri.carbs || 0) * scale,
    },
    scale: parseFloat(scale.toFixed(2)), // Làm tròn cho đẹp log
  };
}

function gaussianScore(itemNutri, targetVec) {
  let sse = 0.0;
  for (const [key, w] of Object.entries(NUTRITION_WEIGHTS)) {
    const t = targetVec[key] || 1;
    const a = itemNutri[key] || 0;
    sse += w * Math.pow((a - t) / t, 2);
  }
  return Math.exp((-0.5 * sse) / TOTAL_W);
}

/**
 * Hàm chọn món core: có thêm logic kiểm tra trùng lặp thông minh
 */
function pickOne(
  pool,
  categoryInput,
  targetVec,
  usedIds = new Set(),
  mealType,
) {
  const allowedCats = Array.isArray(categoryInput)
    ? categoryInput
    : [categoryInput];
  let subPool = pool.filter((r) => allowedCats.includes(r.category));

  // Lọc Blacklist ngay từ đầu cho bữa tối
  if (mealType === "dinner") {
    subPool = subPool.filter((r) => !isHeavyForDinner(r));
  }

  if (subPool.length === 0) return null;

  const scored = subPool.map((recipe) => {
    const { nutri } = getScaledNutri(recipe);
    const fitScore = gaussianScore(nutri, targetVec);
    const isUsed = usedIds.has(recipe._id.toString());
    const isSide = recipe.category === "side_dish";

    // Phạt trùng món
    let varietyScore = isUsed ? 0.0 : 1.0;
    if (recipe.category === "base_starch" && isUsed) varietyScore = 0.3; // Tinh bột lặp lại bị phạt nặng hơn tí

    // PHẠT CỰC NẶNG SIDE DISH:
    // Trừ hẳn 0.8 điểm để nó luôn thua các món Main (thường có điểm từ 0.5 - 1.0)
    let sidePenalty = isSide ? 0.8 : 0.0;

    return {
      finalScore: 0.4 * fitScore + 0.6 * varietyScore - sidePenalty,
      recipe,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const topN = Math.min(scored.length, 3);
  return scored[Math.floor(Math.random() * topN)].recipe;
}

// ─────────────────────────────────────────────────────────────
// TÍNH NĂNG 1: GỢI Ý CHO 1 NGÀY (DAILY PLAN)
// ─────────────────────────────────────────────────────────────
function generateDailyPlan(recipes, adjDt, usedIdsInWeek = new Set()) {
  let dayActual = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  let plan = {};
  let currentDayMain = null;

  for (const mKey of ["breakfast", "lunch", "dinner"]) {
    const mTarget = Object.fromEntries(
      Object.entries(adjDt).map(([k, v]) => [k, v * MEAL_SPLIT[mKey]]),
    );
    let chosen = [];

    if (mKey === "breakfast") {
      const res = pickOne(
        recipes,
        ["one_dish_meal"],
        mTarget,
        usedIdsInWeek,
        mKey,
      );
      if (res) chosen.push(res);
    } else {
      // 1. Chọn tinh bột
      const s = pickOne(
        recipes,
        ["base_starch"],
        { ...mTarget, calories: mTarget.calories * 0.4 },
        usedIdsInWeek,
        mKey,
      );

      // 2. Chọn món mặn (Main)
      let m;
      // KIỂM TRA LEFTOVER: Phải thỏa mãn: (Linh hoạt 30%) + (Không được nằm trong Blacklist buổi tối)
      if (
        mKey === "dinner" &&
        currentDayMain &&
        Math.random() < 0.3 &&
        !isHeavyForDinner(currentDayMain)
      ) {
        m = currentDayMain;
      } else {
        m = pickOne(
          recipes,
          ["main"],
          { ...mTarget, calories: mTarget.calories * 0.4 },
          usedIdsInWeek,
          mKey,
        );
      }

      // 3. Chọn canh/rau
      const v = pickOne(
        recipes,
        ["soup_veg"],
        { ...mTarget, calories: mTarget.calories * 0.2 },
        usedIdsInWeek,
        mKey,
      );

      if (mKey === "lunch") currentDayMain = m;
      chosen = [s, m, v].filter(Boolean);
    }

    // Cập nhật dinh dưỡng thực tế
    chosen.forEach((r) => {
      usedIdsInWeek.add(r._id.toString());
      const { nutri } = getScaledNutri(r);
      dayActual.calories += nutri.calories;
      dayActual.protein += nutri.protein;
      dayActual.fat += nutri.fat;
      dayActual.carbs += nutri.carbs;
    });
    plan[mKey] = chosen;
  }
  return { plan, dayActual };
}

// ─────────────────────────────────────────────────────────────
// TÍNH NĂNG 2: GỢI Ý CHO 1 TUẦN (WEEKLY PLAN)
// ─────────────────────────────────────────────────────────────
function generateWeeklyPlan(recipes, baseDt, history = []) {
  let weeklyHistory = [...history];
  let usedIdsInWeek = new Set(); // ĐẢM BẢO DÒNG NÀY CÓ TỒN TẠI
  let weeklyPlan = [];

  for (let d = 1; d <= 7; d++) {
    const adjDt = adjustTarget(baseDt, weeklyHistory);

    // Truyền Set đã khởi tạo vào đây
    const dayResult = generateDailyPlan(recipes, adjDt, usedIdsInWeek);

    weeklyPlan.push({ day: d, ...dayResult });
    weeklyHistory.push(dayResult.dayActual);
  }
  return weeklyPlan;
}

function adjustTarget(dt, history, smoothing = 3) {
  // Tăng smoothing để bù nợ chậm hơn, êm hơn
  if (history.length === 0) return dt;
  const recent = history.slice(-3);
  const adjusted = { ...dt };

  ["calories", "protein", "fat", "carbs"].forEach((k) => {
    const consumed = recent.reduce((sum, day) => sum + (day[k] || 0), 0);
    const debt = dt[k] * recent.length - consumed;

    // Giới hạn chỉ điều chỉnh tối đa 10% để tránh ăn quá nhiều starch bù calo
    const maxAdj = dt[k] * 0.1;
    adjusted[k] += Math.max(-maxAdj, Math.min(maxAdj, debt / smoothing));
  });
  return adjusted;
}

// ─────────────────────────────────────────────────────────────
// EXECUTION
// ─────────────────────────────────────────────────────────────
async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const recipes = await Recipe.find({
      deleted: { $ne: true },
      "totalNutritionPerServing.calories": { $gt: 0 },
    }).lean();
    if (recipes.length === 0) return;

    const TDEE = 2200;
    const GOAL = "balanced";
    const baseDt = {
      calories: TDEE * GOAL_PROFILES[GOAL].cal_f,
      protein: (TDEE * 0.2) / 4,
      fat: (TDEE * 0.3) / 9,
      carbs: (TDEE * 0.5) / 4,
    };

    // --- DEMO 1: GỢI Ý 1 NGÀY ---
    console.log("--- TEST: GỢI Ý 1 NGÀY ---");
    const singleDay = generateDailyPlan(recipes, baseDt);
    Object.entries(singleDay.plan).forEach(([m, items]) => {
      console.log(`${MEAL_LABEL[m]}: ${items.map((i) => i.name).join(" + ")}`);
    });
    console.log(
      `Tổng Calo thực tế: ${singleDay.dayActual.calories.toFixed(0)}\n`,
    );

    // --- DEMO 2: GỢI Ý 1 TUẦN ---
    // --- THỰC THI GỢI Ý 1 TUẦN ---
    console.log("\n" + "=".repeat(70));
    console.log("📅 KẾ HOẠCH DINH DƯỠNG CHI TIẾT TRONG 1 TUẦN");
    console.log("=".repeat(70));

    const weekly = generateWeeklyPlan(recipes, baseDt);

    weekly.forEach((d) => {
      console.log(
        `\n[ NGÀY ${d.day} ] - Tổng năng lượng: ${d.dayActual.calories.toFixed(0)} kcal`,
      );
      console.log("-".repeat(45));

      // Lặp qua từng bữa ăn trong ngày
      for (const [mealKey, items] of Object.entries(d.plan)) {
        const mealName = MEAL_LABEL[mealKey] || mealKey;

        if (items.length > 0) {
          // Gom tên món và calo của từng món trong bữa
          const details = items
            .map((it) => {
              const { nutri, scale } = getScaledNutri(it);
              return `${it.name} (x${scale.toFixed(1)} - ${nutri.calories.toFixed(0)} kcal)`;
            })
            .join(" + ");

          console.log(`  + Bữa ${mealName.padEnd(5)}: ${details}`);
        } else {
          console.log(
            `  + Bữa ${mealName.padEnd(5)}: (Không tìm thấy món phù hợp)`,
          );
        }
      }
      console.log("- ".repeat(23));
    });

    console.log("\n" + "=".repeat(70));
    console.log("✅ Hoàn tất gợi ý thực đơn tuần.");
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
