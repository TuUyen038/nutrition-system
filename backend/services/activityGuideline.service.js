/**
 * So sánh hoạt động thể lực thực tế (Google Health + buổi tập trong app) với chuẩn WHO,
 * kèm khuyến nghị bài tập cá nhân hóa và trích dẫn tài liệu (RAG).
 *
 * Luồng:
 *   1. (tùy chọn) đồng bộ Google Health 7 ngày
 *   2. dữ liệu: getActivitySummary(7) + WorkoutSession hoàn thành 7 ngày (phân loại theo Exercise.activityType)
 *   3. activityGuideline.rules: compare() + recommend()  -> mọi con số do code tính
 *   4. chọn bài tập trong DB cho từng khuyến nghị (rankExercises: loại trừ chấn thương/thiết bị/độ khó/va chạm)
 *   5. trích dẫn: /rag/retrieve với truy vấn cố định + lọc doc_ids (WHO / HHS / ACSM) cho từng chỉ tiêu
 * ai-service tắt -> vẫn trả so sánh + khuyến nghị, chỉ thiếu trích dẫn (citationsAvailable = false).
 */
const dayjs = require("dayjs");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const WorkoutSession = require("../models/WorkoutSession");
const googleHealthService = require("./googleHealth.service");
const { getTrainingState } = require("./trainingState.service");
const { rankExercises } = require("./exerciseScoring.service");
const { getWorkoutLevel } = require("./workoutRecommendation.service");
const ragClient = require("./ragClient.service");
const rules = require("./activityGuideline.rules");
const { toVNDateString } = require("../utils/date");

const CFG = rules.CFG;
const DISCLAIMER =
  "Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế. Người có bệnh mạn tính, đang mang thai, " +
  "đau ngực / chóng mặt khi vận động nên hỏi ý kiến bác sĩ trước khi tăng lượng tập.";

async function loadAppSessions(userId, from, to) {
  const sessions = await WorkoutSession.find({
    userId,
    completed: true,
    endTime: { $ne: null, $gte: dayjs(from).subtract(1, "day").toDate() },
  })
    .select("exerciseId exerciseName intensity durationMinutes endTime")
    .lean();

  const inWindow = sessions.filter((s) => {
    const d = toVNDateString(s.endTime);
    return d >= from && d <= to;
  });
  const ids = [...new Set(inWindow.map((s) => s.exerciseId).filter((x) => x != null))];
  const exercises = ids.length
    ? await Exercise.find({ exerciseId: { $in: ids } }).select("exerciseId activityType").lean()
    : [];
  const typeById = Object.fromEntries(exercises.map((e) => [e.exerciseId, e.activityType]));

  const strengthDates = new Set();
  const balanceDates = new Set();
  const appAerobicByDate = {};
  inWindow.forEach((s) => {
    const date = toVNDateString(s.endTime);
    const type = typeById[s.exerciseId];
    if (CFG.exerciseTypes.strength.includes(type)) strengthDates.add(date);
    if (CFG.exerciseTypes.balance.includes(type)) balanceDates.add(date);
    if (CFG.exerciseTypes.aerobic.includes(type) && s.intensity !== "light") {
      const day = (appAerobicByDate[date] ||= { moderate: 0, vigorous: 0 });
      day[s.intensity === "vigorous" ? "vigorous" : "moderate"] += s.durationMinutes || 0;
    }
  });
  return {
    sessionsInWindow: inWindow.length,
    strengthDays: strengthDates.size,
    balanceDays: balanceDates.size,
    appAerobicByDate,
  };
}

async function pickExercises(rec, { userId, user, state, group }) {
  if (!rec.exerciseTypes) return [];
  const types = rec.type === "aerobic"
    ? rules.allowedAerobicTypes({ fitnessLevel: user.fitnessLevel, status: state.status, group })
    : rec.exerciseTypes;
  const beginner = CFG.plan.beginnerLevels.includes(user.fitnessLevel || "sedentary");
  const query = { activityType: { $in: types } };
  if (group === "older" || beginner || rec.intensity === "light") query.impactLevel = { $ne: "high" };

  const pool = await Exercise.find(query).limit(150).lean();
  if (!pool.length) return [];
  const { ranked } = await rankExercises(pool, {
    userId,
    user,
    level: getWorkoutLevel(user.fitnessLevel),
    state: { status: state.status, readinessScore: state.readinessScore },
  });
  return ranked.slice(0, CFG.plan.exercisesPerRecommendation).map(({ exercise }) => ({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    activityType: exercise.activityType,
    difficulty: exercise.difficulty || null,
    impactLevel: exercise.impactLevel || null,
  }));
}

async function fetchSources(keys, groupKey) {
  const specs = keys
    .map((key) => ({ key, spec: CFG.groups[groupKey]?.sources?.[key] || CFG.extraSources[key] }))
    .filter((x) => x.spec);
  const results = await Promise.all(
    specs.map(async ({ key, spec }) => {
      try {
        // top-5: một mục có thể bị cắt thành nhiều chunk; chọn chunk đúng mục VÀ chứa cụm khuyến nghị
        const res = await ragClient.retrieve(spec.query, 5, null, spec.docIds);
        const norm = (t) => String(t || "").replace(/\s+/g, " ").toLowerCase();
        const chunks = (res.chunks || []).filter(
          (c) => c.relevant !== false && (!spec.section || norm(c.section).includes(norm(spec.section)))
        );
        const chunk = spec.mustContain
          ? chunks.find((c) => norm(c.text).includes(norm(spec.mustContain)))
          : chunks[0];
        if (!chunk) {
          console.warn(`[ActivityGuideline] no chunk for "${key}" contains "${spec.mustContain}"`);
          return null;
        }
        return { key, ...chunk };
      } catch (err) {
        console.warn(`[ActivityGuideline] RAG source "${key}" failed:`, err.message);
        return { key, error: true };
      }
    })
  );
  return {
    sources: results.filter((r) => r && !r.error),
    available: !results.some((r) => r && r.error),
  };
}

/**
 * @param {string} userId
 * @param {{sync?: boolean}} options sync = true -> đồng bộ Google Health trước (bỏ qua nếu chưa kết nối)
 */
async function getWhoComparison(userId, { sync = false } = {}) {
  if (!userId) throw new Error("userId is required");

  const [user, state] = await Promise.all([
    User.findById(userId).lean(),
    // getTrainingState tự đồng bộ Google khi sync = true (lỗi kết nối -> dùng dữ liệu đã lưu)
    getTrainingState(userId, { sync }).catch((err) => {
      console.warn("[ActivityGuideline] training state unavailable:", err.message);
      return { status: "normal", readinessScore: 5, isColdStart: true, dataAvailability: {} };
    }),
  ]);
  if (!user) throw new Error("User not found");

  const activity = await googleHealthService.getActivitySummary(userId, CFG.windowDays);
  const app = await loadAppSessions(userId, activity.from, activity.to);

  const comparison = rules.compare({
    age: user.age,
    daily: activity.daily,
    appAerobicByDate: app.appAerobicByDate,
    strengthDays: app.strengthDays,
    balanceDays: app.balanceDays,
  });
  const ctx = { fitnessLevel: user.fitnessLevel, status: state.status, isColdStart: state.isColdStart };
  const recommendations = rules.recommend(comparison, ctx);

  for (const rec of recommendations) {
    rec.exercises = await pickExercises(rec, { userId, user, state, group: comparison.group });
  }

  const keys = [...new Set(recommendations.flatMap((r) => r.sourceKeys || []))];
  if (comparison.supported && !keys.includes("aerobic")) keys.unshift("aerobic");
  const { sources, available } = comparison.supported ? await fetchSources(keys, comparison.group) : { sources: [], available: true };

  return {
    window: { from: activity.from, to: activity.to, days: CFG.windowDays },
    profile: { age: user.age ?? null, fitnessLevel: user.fitnessLevel || null, group: comparison.group || null },
    trainingState: {
      status: state.status,
      readinessScore: state.readinessScore,
      isColdStart: state.isColdStart,
      googleSync: state.dataAvailability?.googleSync || "skipped",
    },
    comparison,
    recommendations,
    app: { sessionsInWindow: app.sessionsInWindow, strengthDays: app.strengthDays, balanceDays: app.balanceDays },
    // Mỗi nguồn: key (aerobic | strength | balance | progression | startSmall | strengthPrescription | intensity | steps)
    sources: sources.map(({ key, id, text, doc_id, title, org, year, url, section, lang }) => ({
      key, id, text, doc_id, title, org, year, url, section, lang,
    })),
    citationsAvailable: available,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { getWhoComparison, loadAppSessions, formatForChat: rules.formatForChat, DISCLAIMER };
