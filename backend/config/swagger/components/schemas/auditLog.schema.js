module.exports = {
  AuditLog: {
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
      userEmail: {
        type: "string",
      },
      action: {
        type: "string",
        enum: [
          "CREATE",
          "UPDATE",
          "DELETE",
          "LOGIN",
          "LOGOUT",
          "VERIFY",
          "UNVERIFY",
          "PASSWORD_RESET_REQUEST",
          "PASSWORD_RESET",
        ],
      },
      resourceType: {
        type: "string",
        enum: ["User", "Ingredient", "Recipe", "DailyMenu", "MealPlan", "Auth"],
      },
      resourceId: {
        type: "string",
        format: "ObjectId",
      },
      resourceName: {
        type: "string",
      },
      oldData: {
        type: "object",
      },
      newData: {
        type: "object",
      },
      ipAddress: {
        type: "string",
      },
      userAgent: {
        type: "string",
      },
      timestamp: {
        type: "string",
        format: "date-time",
      },
    },
  },
};
