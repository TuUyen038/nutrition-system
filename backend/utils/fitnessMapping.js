const fitnessToActivityFactor = {
  sedentary: 1.2, // ít hoạt động, chỉ ăn đi làm về ngủ
  beginner: 1.375, // có tập thể dục nhẹ nhàng 1-3 ngày/tuần
  intermediate: 1.55, // có tập thể dục vừa phải 4-5 ngày/tuần
  advanced: 1.725, // có tập thể dục nâng cao 6-7 ngày/tuần
  athlete: 1.9, // vận động rất nhiều, ngày tập 2 lần
};

module.exports = {
  fitnessToActivityFactor,
};