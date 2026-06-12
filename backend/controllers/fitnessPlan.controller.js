const fitnessPlanService =
  require(
    "../services/fitnessPlan.service"
  );

exports.generateWeeklyPlan =
  async (
    req,
    res
  ) => {
    const result =
      await fitnessPlanService.generateWeeklyFitnessPlan(
        req.user._id
      );

    res.json(result);
  };