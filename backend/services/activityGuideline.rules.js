/**
 * So sánh hoạt động thực tế (Google Health + buổi tập trong app) với chuẩn WHO và sinh khuyến nghị.
 * THUẦN: không DB, không mạng -> test được bằng scripts/test_activity_guideline.js.
 * Mọi con số trả về do code tính; LLM chỉ diễn đạt lại (không được đổi số).
 *
 * Nguồn phút aerobic của MỘT ngày (theo thứ tự ưu tiên, không cộng chồng để tránh đếm hai lần):
 *   1. "intensity": Google có phút theo mức -> vừa + mạnh (đúng định nghĩa WHO, bỏ phút nhẹ)
 *   2. "total":     Google chỉ có tổng activeMinutes (dữ liệu cũ / mock) -> có thể gồm cả vận động NHẸ -> ước lượng cao
 *   3. "app":       ngày không có dữ liệu Google -> buổi tập aerobic hoàn thành trong app
 * Ngày không có nguồn nào: không tính vào trung bình; tuần được ngoại suy từ các ngày có dữ liệu.
 */
const CFG = require("../config/whoGuidelines.config");

const round = (x) => Math.round(x);
const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function ageGroup(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return null;
  return Object.keys(CFG.groups).find((k) => n >= CFG.groups[k].ageMin && n <= CFG.groups[k].ageMax) || null;
}

/**
 * @param {Array} daily  [{date, activeMinutes, moderateMinutes, vigorousMinutes, steps}] (getActivitySummary().daily)
 * @param {Object} appAerobicByDate {"YYYY-MM-DD": {moderate, vigorous}} buổi aerobic trong app
 */
function measureAerobic(daily = [], appAerobicByDate = {}, windowDays = CFG.windowDays) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const dates = new Set([...byDate.keys(), ...Object.keys(appAerobicByDate)]);
  const sources = { intensity: 0, total: 0, app: 0 };
  let moderate = 0;
  let vigorous = 0;
  let daysWithData = 0;

  dates.forEach((date) => {
    const d = byDate.get(date) || {};
    if (d.moderateMinutes != null || d.vigorousMinutes != null) {
      moderate += d.moderateMinutes || 0;
      vigorous += d.vigorousMinutes || 0;
      sources.intensity += 1;
    } else if (d.activeMinutes != null) {
      moderate += d.activeMinutes;
      sources.total += 1;
    } else if (appAerobicByDate[date]) {
      moderate += appAerobicByDate[date].moderate || 0;
      vigorous += appAerobicByDate[date].vigorous || 0;
      sources.app += 1;
    } else {
      return;
    }
    daysWithData += 1;
  });

  const equivalent = moderate + CFG.vigorousToModerate * vigorous;
  const scale = daysWithData ? windowDays / daysWithData : 0;
  return {
    daysWithData,
    windowDays,
    moderateMinutes: round(moderate),
    vigorousMinutes: round(vigorous),
    // tổng trong các ngày có dữ liệu
    equivalentMinutes: round(equivalent),
    // ngoại suy ra cả tuần khi thiếu ngày
    weeklyEquivalentMinutes: daysWithData ? round(equivalent * scale) : null,
    dailyMvpaAverage: daysWithData ? round((moderate + vigorous) / daysWithData) : null,
    estimated: daysWithData > 0 && daysWithData < windowDays,
    includesLight: sources.total > 0,
    sources,
  };
}

/**
 * Số phút aerobic/tuần theo cách WHO (vừa + 2 × mạnh, bỏ phút nhẹ), dùng CHUNG cho màn hình so sánh WHO
 * và adaptivePlan để hai nơi luôn ra cùng một số. null khi < minDaysWithData ngày có dữ liệu.
 */
function weeklyWhoMinutes(daily = [], appAerobicByDate = {}) {
  const measure = measureAerobic(daily, appAerobicByDate);
  const minutes = measure.daysWithData >= CFG.minDaysWithData ? measure.weeklyEquivalentMinutes : null;
  return { minutes, measure };
}

function averageSteps(daily = []) {
  const vals = daily.map((d) => d.steps).filter((v) => v != null);
  return vals.length ? { average: round(vals.reduce((a, b) => a + b, 0) / vals.length), daysWithData: vals.length } : null;
}

function statusOf(actual, min, max) {
  if (actual == null) return "insufficient_data";
  if (actual < min) return "below";
  if (max != null && actual > max) return "above";
  return "within";
}

/**
 * @returns so sánh từng chỉ tiêu với chuẩn WHO của nhóm tuổi.
 */
function compare({ age, daily = [], appAerobicByDate = {}, strengthDays = 0, balanceDays = 0 }) {
  const group = ageGroup(age);
  if (!group) {
    return {
      supported: false,
      reason: age == null ? "missing_age" : "age_not_supported",
      message: age == null
        ? "Chưa có tuổi trong hồ sơ nên chưa xác định được chuẩn WHO phù hợp."
        : "Chuẩn WHO trong hệ thống áp dụng cho người từ 5 tuổi trở lên.",
    };
  }
  const g = CFG.groups[group];
  const aerobic = measureAerobic(daily, appAerobicByDate);
  const enough = aerobic.daysWithData >= CFG.minDaysWithData;

  const aerobicResult = g.aerobic.mode === "daily_average"
    ? {
        unit: "phút/ngày (trung bình, vừa + mạnh)",
        actual: enough ? aerobic.dailyMvpaAverage : null,
        target: { min: g.aerobic.min, max: null },
      }
    : {
        unit: "phút/tuần (quy đổi cường độ vừa: vừa + 2 × mạnh)",
        actual: enough ? aerobic.weeklyEquivalentMinutes : null,
        target: { min: g.aerobic.min, max: g.aerobic.max },
      };
  aerobicResult.status = statusOf(aerobicResult.actual, aerobicResult.target.min, aerobicResult.target.max);
  aerobicResult.gap = aerobicResult.status === "below" ? aerobicResult.target.min - aerobicResult.actual : 0;
  aerobicResult.measure = aerobic;

  const strength = {
    unit: "ngày/tuần (buổi tập tăng cơ hoàn thành trong app)",
    actual: strengthDays,
    target: { min: g.strengthDaysMin },
    status: statusOf(strengthDays, g.strengthDaysMin, null),
    gap: Math.max(0, g.strengthDaysMin - strengthDays),
  };
  const balance = g.balanceDaysMin == null ? null : {
    unit: "ngày/tuần (buổi thăng bằng / đa thành phần trong app)",
    actual: balanceDays,
    target: { min: g.balanceDaysMin },
    status: statusOf(balanceDays, g.balanceDaysMin, null),
    gap: Math.max(0, g.balanceDaysMin - balanceDays),
  };

  const notes = [];
  if (!enough) notes.push(`Chỉ có ${aerobic.daysWithData}/${aerobic.windowDays} ngày có dữ liệu vận động (cần ít nhất ${CFG.minDaysWithData}).`);
  if (enough && aerobic.estimated) notes.push(`Có ${aerobic.daysWithData}/${aerobic.windowDays} ngày có dữ liệu, số phút cả tuần là ước lượng.`);
  if (aerobic.includesLight) notes.push("Một số ngày Google chỉ có tổng phút vận động (có thể gồm vận động nhẹ) nên số phút có thể cao hơn thực tế.");
  if (aerobic.sources.app) notes.push("Ngày không có dữ liệu Google được tính bằng buổi tập trong app.");
  notes.push("Số ngày tăng cơ/thăng bằng chỉ tính buổi tập trong app (Google không phân biệt loại bài tập).");

  return {
    supported: true,
    group,
    label: g.label,
    aerobic: aerobicResult,
    strength,
    balance,
    steps: averageSteps(daily), // chỉ tham khảo: WHO không đặt chỉ tiêu số bước
    notes,
  };
}

function aerobicPlan(gapWeekly, beginner) {
  const P = CFG.plan;
  const weeklyAdd = beginner ? Math.min(gapWeekly, P.beginnerWeeklyIncrease) : gapWeekly;
  const sessions = clamp(Math.ceil(weeklyAdd / P.minutesPerSession), 1, P.maxSessionsPerWeek);
  const minutesPerSession = Math.max(P.minMinutesPerSession, round5(weeklyAdd / sessions));
  return { weeklyAdd: round(weeklyAdd), sessions, minutesPerSession, gradual: weeklyAdd < gapWeekly };
}

/**
 * Khuyến nghị theo luật. ctx: { fitnessLevel, status (trainingState: ready|normal|tired|overreached), isColdStart }
 * Mỗi khuyến nghị: { type, priority, title, detail{...số do hệ thống tính}, intensity, exerciseTypes, sourceKeys }
 */
function recommend(cmp, ctx = {}) {
  if (!cmp.supported) return [{ type: "profile", priority: 1, title: cmp.message, detail: {}, sourceKeys: [] }];
  const g = CFG.groups[cmp.group];
  const recs = [];
  const status = ctx.status || "normal";
  const beginner = CFG.plan.beginnerLevels.includes(ctx.fitnessLevel || "sedentary") || !!ctx.isColdStart;
  const intensity = status === "tired" ? "light" : "moderate";
  const tired = status === "tired" || status === "overreached";

  if (status === "overreached") {
    recs.push({
      type: "recover",
      priority: 1,
      title: "Cơ thể đang quá tải: ưu tiên nghỉ ngơi / vận động nhẹ 1–2 ngày trước khi tăng lượng tập.",
      detail: { trainingStatus: status },
      intensity: "light",
      sourceKeys: ["progression"],
    });
  }

  const a = cmp.aerobic;
  if (a.status === "insufficient_data") {
    recs.push({
      type: "connect_data",
      priority: 2,
      title: "Chưa đủ dữ liệu vận động để so với WHO: kết nối/đồng bộ Google Health và đeo thiết bị thường xuyên hơn.",
      detail: { daysWithData: a.measure.daysWithData, minDaysWithData: CFG.minDaysWithData },
      sourceKeys: [],
    });
  } else if (a.status === "below" && status !== "overreached") {
    const dailyMode = g.aerobic.mode === "daily_average";
    const plan = dailyMode
      ? { dailyAdd: round5(a.gap), gradual: false }
      : aerobicPlan(a.gap, beginner);
    recs.push({
      type: "aerobic",
      priority: 2,
      title: dailyMode
        ? `Tăng vận động aerobic thêm khoảng ${plan.dailyAdd} phút mỗi ngày.`
        : `Thêm ${plan.sessions} buổi aerobic × ${plan.minutesPerSession} phút cường độ ${intensity === "light" ? "nhẹ đến vừa" : "vừa"} trong tuần tới.`,
      detail: { actual: a.actual, gap: a.gap, ...plan },
      intensity,
      exerciseTypes: CFG.exerciseTypes.aerobic,
      sourceKeys: ["aerobic", "intensity", ...(plan.gradual || beginner ? ["progression", "startSmall"] : [])],
    });
  } else if (a.status === "within" || a.status === "above") {
    recs.push({
      type: "aerobic_maintain",
      priority: 4,
      title: a.status === "above"
        ? "Lượng aerobic đã vượt mức khuyến nghị cơ bản: duy trì" + (tired ? ", và ưu tiên hồi phục vì đang mệt." : ".")
        : "Lượng aerobic đã đạt khuyến nghị: duy trì" + (!tired && a.target.max ? ", có thể tăng dần tới mức trên của khuyến nghị." : "."),
      detail: { actual: a.actual },
      sourceKeys: ["aerobic"],
    });
  }

  const s = cmp.strength;
  if (s.status === "below" && status !== "overreached") {
    recs.push({
      type: "strength",
      priority: 3,
      title: `Thêm ${s.gap} buổi tập tăng cơ toàn thân (các nhóm cơ lớn) mỗi tuần.`,
      detail: { actual: s.actual, sessionsToAdd: s.gap },
      intensity,
      exerciseTypes: CFG.exerciseTypes.strength,
      sourceKeys: ["strength", ...(cmp.group === "child" ? [] : ["strengthPrescription"])],
    });
  }

  const b = cmp.balance;
  if (b && b.status === "below" && status !== "overreached") {
    recs.push({
      type: "balance",
      priority: 3,
      title: `Thêm ${b.gap} buổi vận động đa thành phần (thăng bằng + sức mạnh) mỗi tuần để phòng ngã.`,
      detail: { actual: b.actual, sessionsToAdd: b.gap },
      intensity: "light",
      exerciseTypes: CFG.exerciseTypes.balance,
      sourceKeys: ["balance"],
    });
  }

  if (cmp.steps) {
    recs.push({
      type: "steps_info",
      priority: 5,
      title: `Trung bình ${cmp.steps.average} bước/ngày: chỉ để theo dõi, số bước không phải chỉ tiêu của WHO.`,
      detail: cmp.steps,
      sourceKeys: ["steps"],
    });
  }

  return recs.sort((x, y) => x.priority - y.priority);
}

/** Loại bài tập được phép cho khuyến nghị aerobic (HIIT chỉ khi đã quen tập và đang sung sức). */
function allowedAerobicTypes({ fitnessLevel, status, group }) {
  const hiitOk = CFG.hiitMinFitness.includes(fitnessLevel) && status === "ready" && group !== "older";
  return CFG.exerciseTypes.aerobic.filter((t) => t !== "hiit" || hiitOk);
}

// ─── Văn bản cho chatbot ──────────────────────────────────────────────────────

const STATUS_VI = { below: "CHƯA ĐẠT", within: "ĐẠT", above: "VƯỢT mức cơ bản", insufficient_data: "CHƯA ĐỦ DỮ LIỆU" };

/**
 * Tách 2 phần: `personal` (số liệu của user + đề xuất do hệ thống tính -> được dùng KHÔNG cần [Sx])
 * và phần chuẩn WHO (LLM phải trích [Sx] khi nêu số chuẩn). sourceId(key) -> "S1"...
 */
function formatForChat(result, sourceId = () => null) {
  const c = result.comparison;
  if (!c.supported) {
    return { personal: c.message, standards: "" };
  }
  const cite = (key) => (sourceId(key) ? ` [${sourceId(key)}]` : "");
  const a = c.aerobic;
  const m = a.measure;
  const lines = [
    `Khoảng thời gian: ${result.window.from} đến ${result.window.to}; ngày có dữ liệu vận động: ${m.daysWithData}/${m.windowDays}.`,
    a.actual == null
      ? "Aerobic: chưa đủ dữ liệu."
      : `Aerobic thực tế: ${a.actual} ${a.unit} (vừa ${m.moderateMinutes} phút, mạnh ${m.vigorousMinutes} phút) -> ${STATUS_VI[a.status]}` +
        (a.gap ? `, còn thiếu ${a.gap}` : "") + ".",
    `Tăng cơ thực tế: ${c.strength.actual} ${c.strength.unit} -> ${STATUS_VI[c.strength.status]}.`,
  ];
  if (c.balance) lines.push(`Thăng bằng thực tế: ${c.balance.actual} ${c.balance.unit} -> ${STATUS_VI[c.balance.status]}.`);
  if (c.steps) lines.push(`Bước chân trung bình: ${c.steps.average} bước/ngày (${c.steps.daysWithData} ngày có dữ liệu).`);
  lines.push(`Trạng thái tập luyện: ${result.trainingState.status} (readiness ${result.trainingState.readinessScore}).`);
  c.notes.forEach((n) => lines.push(`Lưu ý dữ liệu: ${n}`));

  const recLines = result.recommendations.map((r, i) => {
    const ex = (r.exercises || []).map((e) => e.name).join(", ");
    return `${i + 1}. ${r.title}${ex ? ` Bài tập gợi ý trong hệ thống: ${ex}.` : ""}`;
  });

  const g = CFG.groups[c.group];
  const std = [
    `Nhóm: ${c.label}.`,
    g.aerobic.mode === "daily_average"
      ? `Chuẩn WHO aerobic: trung bình ít nhất ${g.aerobic.min} phút/ngày cường độ vừa đến mạnh${cite("aerobic")}.`
      : `Chuẩn WHO aerobic: ${g.aerobic.min}–${g.aerobic.max} phút/tuần cường độ vừa (hoặc tương đương)${cite("aerobic")}.`,
    `Chuẩn WHO tăng cơ: ít nhất ${g.strengthDaysMin} ngày/tuần${cite("strength")}.`,
  ];
  if (g.balanceDaysMin) std.push(`Chuẩn WHO thăng bằng / đa thành phần: ít nhất ${g.balanceDaysMin} ngày/tuần${cite("balance")}.`);

  return {
    personal: `[DỮ LIỆU CỦA USER]\n${lines.join("\n")}\n\n[ĐỀ XUẤT DO HỆ THỐNG TÍNH]\n${recLines.join("\n")}`,
    standards: `[CHUẨN KHUYẾN NGHỊ - khi nêu số chuẩn PHẢI kèm mã nguồn]\n${std.join("\n")}`,
  };
}

module.exports = { ageGroup, measureAerobic, weeklyWhoMinutes, compare, recommend, aerobicPlan, allowedAerobicTypes, formatForChat, CFG };
