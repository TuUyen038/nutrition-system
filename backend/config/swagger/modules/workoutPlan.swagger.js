module.exports = {
  "/workout-plan/current": {
    get: {
      tags: ["Workout Plan"],

      summary: "Get current weekly workout plan",

      description:
        "Get current adaptive weekly workout plan of user",

      security: [{ bearerAuth: [] }],

      responses: {
        200: {
          description:
            "Current workout plan fetched successfully",

          content: {
            "application/json": {
              schema: {
                type: "object",

                properties: {
                  success: {
                    type: "boolean",
                    example: true,
                  },

                  data: {
                    $ref: "#/components/schemas/WorkoutPlan",
                  },
                },
              },
            },
          },
        },

        500: {
          description: "Server error",
        },
      },
    },
  },

  "/workout-plan/generate": {
    post: {
      tags: ["Workout Plan"],

      summary: "Generate first weekly plan",

      description:
        "Generate first adaptive weekly workout plan",

      security: [{ bearerAuth: [] }],

      responses: {
        200: {
          description:
            "Workout plan generated successfully",

          content: {
            "application/json": {
              schema: {
                type: "object",

                properties: {
                  success: {
                    type: "boolean",
                    example: true,
                  },

                  message: {
                    type: "string",
                    example:
                      "Weekly workout plan generated successfully",
                  },

                  data: {
                    $ref: "#/components/schemas/WorkoutPlan",
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  "/workout-plan/complete": {
    patch: {
      tags: ["Workout Plan"],

      summary: "Complete workout day",

      description:
        "Mark a workout day as completed",

      security: [{ bearerAuth: [] }],

      requestBody: {
        required: true,

        content: {
          "application/json": {
            schema: {
              type: "object",

              required: ["day"],

              properties: {
                day: {
                  type: "number",
                  example: 3,
                },
              },
            },
          },
        },
      },

      responses: {
        200: {
          description:
            "Workout day completed successfully",

          content: {
            "application/json": {
              schema: {
                type: "object",

                properties: {
                  success: {
                    type: "boolean",
                    example: true,
                  },

                  message: {
                    type: "string",
                    example: "Day 3 completed",
                  },

                  data: {
                    $ref: "#/components/schemas/WorkoutPlan",
                  },
                },
              },
            },
          },
        },

        400: {
          description: "Bad request",
        },
      },
    },
  },

  "/workout-plan/skip": {
    patch: {
      tags: ["Workout Plan"],

      summary: "Skip workout day",

      description:
        "Skip a workout day in current weekly plan",

      security: [{ bearerAuth: [] }],

      requestBody: {
        required: true,

        content: {
          "application/json": {
            schema: {
              type: "object",

              required: ["day"],

              properties: {
                day: {
                  type: "number",
                  example: 4,
                },
              },
            },
          },
        },
      },

      responses: {
        200: {
          description:
            "Workout day skipped successfully",

          content: {
            "application/json": {
              schema: {
                type: "object",

                properties: {
                  success: {
                    type: "boolean",
                    example: true,
                  },

                  message: {
                    type: "string",
                    example: "Day 4 skipped",
                  },

                  data: {
                    $ref: "#/components/schemas/WorkoutPlan",
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  "/workout-plan/next-week": {
    post: {
      tags: ["Workout Plan"],

      summary: "Generate next adaptive week",

      description:
        "Generate next workout week based on previous performance",

      security: [{ bearerAuth: [] }],

      responses: {
        200: {
          description:
            "Next adaptive week generated successfully",

          content: {
            "application/json": {
              schema: {
                type: "object",

                properties: {
                  success: {
                    type: "boolean",
                    example: true,
                  },

                  message: {
                    type: "string",
                    example:
                      "Next adaptive workout week generated",
                  },

                  data: {
                    $ref: "#/components/schemas/WorkoutPlan",
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  "/workout-plan/stats": {
    get: {
      tags: ["Workout Plan"],

      summary: "Get workout statistics",

      description:
        "Get workout progress and statistics",

      security: [{ bearerAuth: [] }],

      responses: {
        200: {
          description:
            "Workout statistics fetched successfully",

          content: {
            "application/json": {
              schema: {
                type: "object",

                properties: {
                  success: {
                    type: "boolean",
                    example: true,
                  },

                  data: {
                    $ref: "#/components/schemas/WorkoutPlanStats",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};