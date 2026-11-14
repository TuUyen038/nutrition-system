/**
 * Test phần tính toán so sánh với WHO (thuần, không cần MongoDB / node_modules):
 *   node scripts/test_activity_guideline.js
 */
const assert = require("assert");
const R = require("../services/activityGuideline.rules");

const days = (n, fn) => Array.from({ length: n }, (_, i) => ({ date: `2026-11-${String(10 + i).padStart(2, "0")}`, ...fn(i) }));
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test("nhóm tuổi", () => {
  assert.strictEqual(R.ageGroup(4), null);
  assert.strictEqual(R.ageGroup(10), "child");
  assert.strictEqual(R.ageGroup(30), "adult");
  assert.strictEqual(R.ageGroup(64), "adult");
  assert.strictEqual(R.ageGroup(65), "older");
  assert.strictEqual(R.ageGroup(undefined), null);
});

test("quy đổi WHO: vừa + 2 × mạnh, bỏ phút nhẹ", () => {
  const m = R.measureAerobic(days(7, () => ({ activeMinutes: 60, moderateMinutes: 10, vigorousMinutes: 5 })));
  assert.strictEqual(m.moderateMinutes, 70);
  assert.strictEqual(m.vigorousMinutes, 35);
  assert.strictEqual(m.weeklyEquivalentMinutes, 140); // KHÔNG phải 420 (tổng activeMinutes có phút nhẹ)
  assert.strictEqual(m.includesLight, false);
});

test("thiếu ngày -> ngoại suy + đánh dấu ước lượng", () => {
  const m = R.measureAerobic(days(5, () => ({ moderateMinutes: 20, vigorousMinutes: 0 })));
  assert.strictEqual(m.daysWithData, 5);
  assert.strictEqual(m.weeklyEquivalentMinutes, 140);
  assert.strictEqual(m.estimated, true);
});

test("không đếm hai lần: ngày có Google thì bỏ buổi app của ngày đó", () => {
  const daily = days(1, () => ({ moderateMinutes: 30, vigorousMinutes: 0 }));
  const app = { [daily[0].date]: { moderate: 45, vigorous: 0 }, "2026-11-20": { moderate: 40, vigorous: 0 } };
  const m = R.measureAerobic(daily, app);
  assert.strictEqual(m.moderateMinutes, 70); // 30 (Google) + 40 (ngày chỉ có app)
  assert.deepStrictEqual(m.sources, { intensity: 1, total: 0, app: 1 });
});

test("dữ liệu cũ chỉ có tổng phút -> cảnh báo có thể gồm vận động nhẹ", () => {
  const c = R.compare({ age: 30, daily: days(7, () => ({ activeMinutes: 30 })) });
  assert.strictEqual(c.aerobic.measure.includesLight, true);
  assert.ok(c.notes.some((n) => n.includes("vận động nhẹ")));
});

test("người lớn thiếu aerobic + thiếu tăng cơ -> khuyến nghị đúng số", () => {
  const c = R.compare({ age: 30, daily: days(7, () => ({ moderateMinutes: 10, vigorousMinutes: 0, steps: 6000 })), strengthDays: 1 });
  assert.strictEqual(c.aerobic.actual, 70);
  assert.strictEqual(c.aerobic.status, "below");
  assert.strictEqual(c.aerobic.gap, 80);
  const recs = R.recommend(c, { fitnessLevel: "intermediate", status: "ready" });
  const aer = recs.find((r) => r.type === "aerobic");
  assert.deepStrictEqual([aer.detail.sessions, aer.detail.minutesPerSession], [3, 25]); // 80 phút -> 3 buổi × 25
  assert.strictEqual(recs.find((r) => r.type === "strength").detail.sessionsToAdd, 1);
  assert.ok(recs.find((r) => r.type === "steps_info").title.includes("không phải chỉ tiêu"));
});

test("người mới tập: tăng dần tối đa 60 phút/tuần", () => {
  const c = R.compare({ age: 40, daily: days(7, () => ({ moderateMinutes: 0, vigorousMinutes: 0 })) });
  const aer = R.recommend(c, { fitnessLevel: "sedentary", status: "normal" }).find((r) => r.type === "aerobic");
  assert.strictEqual(aer.detail.weeklyAdd, 60);
  assert.strictEqual(aer.detail.gradual, true);
  assert.ok(aer.sourceKeys.includes("progression"));
});

test("đạt chuẩn -> duy trì, không thêm buổi aerobic", () => {
  const c = R.compare({ age: 30, daily: days(7, () => ({ moderateMinutes: 20, vigorousMinutes: 5 })), strengthDays: 2 });
  assert.strictEqual(c.aerobic.actual, 210);
  assert.strictEqual(c.aerobic.status, "within");
  const recs = R.recommend(c, { status: "ready" });
  assert.ok(!recs.some((r) => r.type === "aerobic" || r.type === "strength"));
  assert.ok(recs.some((r) => r.type === "aerobic_maintain"));
});

test("quá tải -> chỉ khuyên hồi phục, không tăng lượng tập", () => {
  const c = R.compare({ age: 30, daily: days(7, () => ({ moderateMinutes: 5, vigorousMinutes: 0 })) });
  const recs = R.recommend(c, { status: "overreached" });
  assert.strictEqual(recs[0].type, "recover");
  assert.ok(!recs.some((r) => ["aerobic", "strength", "balance"].includes(r.type)));
});

test("người cao tuổi: thêm chỉ tiêu thăng bằng 3 ngày", () => {
  const c = R.compare({ age: 70, daily: days(7, () => ({ moderateMinutes: 25, vigorousMinutes: 0 })), strengthDays: 2, balanceDays: 1 });
  assert.strictEqual(c.balance.target.min, 3);
  assert.strictEqual(R.recommend(c, { status: "normal" }).find((r) => r.type === "balance").detail.sessionsToAdd, 2);
});

test("trẻ em: trung bình 60 phút/ngày, vừa + mạnh không nhân đôi", () => {
  const c = R.compare({ age: 10, daily: days(7, () => ({ moderateMinutes: 30, vigorousMinutes: 15 })), strengthDays: 3 });
  assert.strictEqual(c.aerobic.actual, 45);
  assert.strictEqual(c.aerobic.gap, 15);
  assert.strictEqual(R.recommend(c, {}).find((r) => r.type === "aerobic").detail.dailyAdd, 15);
});

test("thiếu dữ liệu / thiếu tuổi -> không kết luận", () => {
  const c = R.compare({ age: 30, daily: days(2, () => ({ moderateMinutes: 30 })) });
  assert.strictEqual(c.aerobic.status, "insufficient_data");
  assert.strictEqual(R.recommend(c, {})[0].type, "connect_data");
  assert.strictEqual(R.compare({ age: null }).supported, false);
});

test("HIIT chỉ gợi ý khi đã quen tập, đang sung sức, không phải người cao tuổi", () => {
  assert.ok(!R.allowedAerobicTypes({ fitnessLevel: "beginner", status: "ready", group: "adult" }).includes("hiit"));
  assert.ok(R.allowedAerobicTypes({ fitnessLevel: "advanced", status: "ready", group: "adult" }).includes("hiit"));
  assert.ok(!R.allowedAerobicTypes({ fitnessLevel: "advanced", status: "ready", group: "older" }).includes("hiit"));
});

console.log(`\n${passed} test đạt`);
