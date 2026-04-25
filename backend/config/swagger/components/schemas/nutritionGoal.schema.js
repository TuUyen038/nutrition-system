module.exports = {
  NutritionGoal: {
    type: "object",
    properties: {
      _id: {
        type: "string",
        format: "ObjectId",
      },
      userId: {
        type: "string",
        format: "ObjectId",
      },
      bodySnapshot: {
        type: "object",
        properties: {
          age: { type: "number" },
          gender: { type: "string" },
          height: { type: "number" },
          weight: { type: "number" },
          goal: { type: "string" },
          activityFactor: { type: "number" },
        },
      },
      targetNutrition: {
        $ref: "#/components/schemas/Nutrition",
      },
      status: {
        type: "string",
        enum: ["active", "inactive"],
      },
      period: {
        type: "string",
        enum: ["day", "week", "month", "custom"],
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
};
