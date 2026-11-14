/**
 * Chuẩn khuyến nghị hoạt động thể lực dùng để so với dữ liệu Google Health.
 *
 * MỌI con số ở đây lấy nguyên văn từ tài liệu trong kho RAG (ai-service/data/raw, đã kiểm tra bằng
 * scripts/check_sources.py). Mỗi chỉ tiêu ghi `source`: doc_id + truy vấn cố định để lấy đúng chunk làm trích dẫn.
 * Sửa số ở đây -> phải sửa theo tài liệu, không tự đặt.
 *
 * WHO 2020 (who_physical_activity_2020):
 *  - Adults 18–64: "at least 150–300 minutes of moderate-intensity aerobic physical activity; or at least
 *    75–150 minutes of vigorous-intensity ... or an equivalent combination", "muscle-strengthening activities
 *    ... on 2 or more days a week".
 *  - Older adults 65+: như người lớn + "varied multicomponent physical activity that emphasizes functional
 *    balance and strength training at moderate or greater intensity, on 3 or more days a week".
 *  - Children 5–17: "at least an average of 60 minutes per day of moderate- to vigorous-intensity, mostly
 *    aerobic", "vigorous-intensity aerobic activities, as well as those that strengthen muscle and bone,
 *    should be incorporated at least 3 days a week".
 * Quy đổi 1 phút cường độ mạnh = 2 phút cường độ vừa: theo "75–150 vigorous ~ 150–300 moderate" của WHO và
 * "2 minutes of moderate-intensity activity counts the same as 1 minute of vigorous-intensity" (HHS 2018).
 */
const WHO_DOC = "who_physical_activity_2020";
const HHS_DOC = "us_physical_activity_guidelines_2018";
const ACSM_DOC = "acsm_resistance_training_2026";

module.exports = {
  // Cửa sổ so sánh: 7 ngày gần nhất (tính cả hôm nay, giờ VN)
  windowDays: 7,
  // Ít hơn số ngày có dữ liệu này -> "chưa đủ dữ liệu", không kết luận
  minDaysWithData: 4,
  vigorousToModerate: 2,

  groups: {
    child: {
      ageMin: 5,
      ageMax: 17,
      label: "Trẻ em và vị thành niên (5–17 tuổi)",
      aerobic: { mode: "daily_average", min: 60 }, // phút/ngày trung bình, MVPA (không nhân đôi)
      strengthDaysMin: 3, // "strengthen muscle and bone ... at least 3 days a week"
      balanceDaysMin: null,
      sources: {
        aerobic: { docIds: [WHO_DOC], query: "Children and adolescents should do at least an average of 60 minutes per day of moderate- to vigorous-intensity aerobic physical activity", mustContain: "average of 60 minutes per day", section: "Children and adolescents (aged 5–17 years) – physical activity" },
        strength: { docIds: [WHO_DOC], query: "Children and adolescents vigorous-intensity aerobic activities and those that strengthen muscle and bone at least 3 days a week", mustContain: "strengthen muscle and bone", section: "Children and adolescents (aged 5–17 years) – physical activity" },
      },
    },
    adult: {
      ageMin: 18,
      ageMax: 64,
      label: "Người trưởng thành (18–64 tuổi)",
      aerobic: { mode: "weekly_equivalent", min: 150, max: 300 }, // phút/tuần quy đổi cường độ vừa
      strengthDaysMin: 2,
      balanceDaysMin: null,
      sources: {
        aerobic: { docIds: [WHO_DOC], query: "Adults should do at least 150–300 minutes of moderate-intensity aerobic physical activity or at least 75–150 minutes of vigorous-intensity aerobic physical activity", mustContain: "75–150 minutes of vigorous", section: "Adults (aged 18–64 years) – physical activity" },
        strength: { docIds: [WHO_DOC], query: "Adults should also do muscle-strengthening activities at moderate or greater intensity that involve all major muscle groups on 2 or more days a week", mustContain: "on 2 or more days a week", section: "Adults (aged 18–64 years) – physical activity" },
      },
    },
    older: {
      ageMin: 65,
      ageMax: 150,
      label: "Người cao tuổi (từ 65 tuổi)",
      aerobic: { mode: "weekly_equivalent", min: 150, max: 300 },
      strengthDaysMin: 2,
      balanceDaysMin: 3,
      sources: {
        aerobic: { docIds: [WHO_DOC], query: "Older adults should do at least 150–300 minutes of moderate-intensity aerobic physical activity", mustContain: "75–150 minutes of vigorous", section: "Older adults (aged 65 years and older) – physical activity" },
        strength: { docIds: [WHO_DOC], query: "Older adults should also do muscle-strengthening activities at moderate or greater intensity that involve all major muscle groups on 2 or more days a week", mustContain: "on 2 or more days a week", section: "Older adults (aged 65 years and older) – physical activity" },
        balance: { docIds: [WHO_DOC], query: "older adults should do varied multicomponent physical activity that emphasizes functional balance and strength training on 3 or more days a week to prevent falls", mustContain: "functional balance", section: "Older adults (aged 65 years and older) – physical activity" },
      },
    },
  },

  // Nguồn cho phần "cách làm" (không phải chỉ tiêu WHO).
  // mustContain: cụm chữ (nguyên văn) mà chunk trích dẫn PHẢI chứa. Một mục WHO có thể bị cắt thành nhiều chunk
  // (VD mục Adults: chunk có "150–300 ... 75–150" và chunk "more than 300 minutes"), nên lấy top-3 rồi chọn chunk
  // đầu tiên chứa cụm này, tránh trích nhầm chunk không có câu khuyến nghị chính.
  // section: chuỗi con của đường dẫn mục mà chunk phải thuộc (VD không lấy mục Adults cho người cao tuổi).
  extraSources: {
    progression: { docIds: [HHS_DOC], query: "Increase physical activity gradually over time risk of injury", mustContain: "gradual" },
    startSmall: { docIds: [WHO_DOC], query: "Doing some physical activity is better than doing none start by doing small amounts and gradually increase", mustContain: "small amounts" },
    strengthPrescription: { docIds: [ACSM_DOC], query: "voluntary strength was enhanced by lifting heavier loads complete range of motion 2–3 sets beginning of training sessions 2 sessions per week", mustContain: "80% one-repetition maximum", section: "Abstract" },
    intensity: { docIds: [HHS_DOC], query: "talk test moderate-intensity activity can talk but not sing vigorous-intensity", mustContain: "talk, but not sing" },
    steps: { docIds: [HHS_DOC], query: "Popular advice such as walking 10,000 steps a day is not a guideline per se", mustContain: "not a guideline per se" },
  },

  // Loại bài tập trong DB (Exercise.activityType) cho từng loại khuyến nghị
  exerciseTypes: {
    aerobic: ["cardio_machine", "aerobic_dance", "hiit"],
    strength: ["strength_training", "calisthenics", "functional_training"],
    balance: ["functional_training", "yoga_stretching"],
  },
  // HIIT / bài va chạm mạnh chỉ gợi ý khi user đã quen tập và đang ở trạng thái tốt
  hiitMinFitness: ["intermediate", "advanced", "athlete"],

  // Kế hoạch tăng dần (đề xuất của HỆ THỐNG, không phải số của WHO)
  plan: {
    minutesPerSession: 30, // buổi aerobic chuẩn
    minMinutesPerSession: 10,
    maxSessionsPerWeek: 5,
    // Người mới / ít vận động / chưa có lịch sử tập: mỗi tuần chỉ thêm tối đa chừng này phút
    beginnerWeeklyIncrease: 60,
    beginnerLevels: ["sedentary", "beginner"],
    exercisesPerRecommendation: 3,
  },
};
