/**
 * Demo so sánh dữ liệu vận động với chuẩn WHO trên 3 hồ sơ mẫu (thuần, không cần MongoDB / Google / Gemini).
 * Dữ liệu 7 ngày dạng giống GoogleHealthData sau khi đồng bộ. Dùng để minh họa trong báo cáo.
 *
 *   node scripts/demo_who_comparison.js
 */
const R = require("../services/activityGuideline.rules");

const week = (fn) =>
  Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${String(9 + i).padStart(2, "0")}`, ...fn(i) }));

const PROFILES = [
  {
    title: "Nhân viên văn phòng 30 tuổi, mới tập, chủ yếu đi bộ (Google: bước chân + phút theo mức)",
    age: 30, fitnessLevel: "beginner", status: "normal",
    daily: week((i) => ({ steps: 5200 + i * 150, activeMinutes: 48, moderateMinutes: 12, vigorousMinutes: i % 3 === 0 ? 5 : 0 })),
    strengthDays: 1,
  },
  {
    title: "Người 35 tuổi tập đều: chạy bộ nhập tay + 2 buổi tạ trong app",
    age: 35, fitnessLevel: "intermediate", status: "ready",
    daily: week((i) => ({ steps: 9000, activeMinutes: 70, moderateMinutes: 25, vigorousMinutes: i % 2 === 0 ? 10 : 0 })),
    strengthDays: 2,
  },
  {
    title: "Người 70 tuổi, đi bộ đều, chưa tập thăng bằng, chỉ có 5/7 ngày dữ liệu",
    age: 70, fitnessLevel: "beginner", status: "normal",
    daily: week((i) => (i < 5 ? { steps: 4000, activeMinutes: 35, moderateMinutes: 20, vigorousMinutes: 0 } : {})),
    strengthDays: 2, balanceDays: 0,
  },
];

PROFILES.forEach((p, n) => {
  const comparison = R.compare({ age: p.age, daily: p.daily, strengthDays: p.strengthDays, balanceDays: p.balanceDays || 0 });
  const recommendations = R.recommend(comparison, { fitnessLevel: p.fitnessLevel, status: p.status });
  const { personal, standards } = R.formatForChat(
    { window: { from: "2026-11-09", to: "2026-11-15" }, comparison, recommendations,
      trainingState: { status: p.status, readinessScore: p.status === "ready" ? 8 : 6 } },
    (key) => ({ aerobic: "S1", strength: "S1", balance: "S2" }[key]) // mã nguồn minh họa
  );
  console.log(`\n================ Hồ sơ ${n + 1}: ${p.title}`);
  console.log(`Tổng phút Google (kể cả vận động nhẹ): ${p.daily.reduce((a, d) => a + (d.activeMinutes || 0), 0)} phút/tuần`);
  console.log(personal);
  console.log(standards);
});
