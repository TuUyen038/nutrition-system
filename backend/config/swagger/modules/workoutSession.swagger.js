module.exports = {
  "/workout-session/start": {
    post: {
      tags: ["Workout Session"],

      summary: "Bắt đầu buổi tập",

      description:
        "Tạo workout session mới từ adaptive workout plan",

      security: [{ bearerAuth: [] }],

      requestBody: {
        required: true,

        content: {
          "application/json": {
            schema: {
              $ref:
                "#/components/schemas/StartWorkoutRequest",
            },
          },
        },
      },

      responses: {
        200: {
          description:
            "Bắt đầu workout thành công",

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
                    $ref:
                      "#/components/schemas/WorkoutSession",
                  },
                },
              },
            },
          },
        },

        400: {
          description:
            "Dữ liệu không hợp lệ",
        },

        401: {
          description:
            "Unauthorized - Token không hợp lệ",
        },
      },
    },
  },

  "/workout-session/stop": {
    post: {
      tags: ["Workout Session"],

      summary: "Kết thúc buổi tập",

      description:
        "Stop workout session và tính toán calories, fatigue, performance",

      security: [{ bearerAuth: [] }],

      requestBody: {
        required: true,

        content: {
          "application/json": {
            schema: {
              $ref:
                "#/components/schemas/StopWorkoutRequest",
            },
          },
        },
      },

      responses: {
        200: {
          description:
            "Kết thúc workout thành công",

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
                      "Workout completed successfully",
                  },

                  data: {
                    $ref:
                      "#/components/schemas/WorkoutSession",
                  },
                },
              },
            },
          },
        },

        400: {
          description:
            "Session không hợp lệ",
        },

        401: {
          description:
            "Unauthorized - Token không hợp lệ",
        },

        404: {
          description:
            "Không tìm thấy session",
        },
      },
    },
  },

  "/workout-session/complete": {
    post: {
      tags: ["Workout Session"],

      summary: "Hoàn thành workout",

      description:
        "Alias của stop workout session",

      security: [{ bearerAuth: [] }],

      requestBody: {
        required: true,

        content: {
          "application/json": {
            schema: {
              $ref:
                "#/components/schemas/StopWorkoutRequest",
            },
          },
        },
      },

      responses: {
        200: {
          description:
            "Workout completed successfully",

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
                      "Workout completed successfully",
                  },

                  data: {
                    $ref:
                      "#/components/schemas/WorkoutSession",
                  },
                },
              },
            },
          },
        },

        400: {
          description:
            "Session không hợp lệ",
        },

        401: {
          description:
            "Unauthorized - Token không hợp lệ",
        },
      },
    },
  },

  "/workout-session/today-kcal": {
    get: {
      tags: ["Workout Session"],

      summary:
        "Lấy lượng calories hôm nay",

      description:
        "Tổng calories user đã đốt trong ngày",

      security: [{ bearerAuth: [] }],

      parameters: [
        {
          in: "query",

          name: "userId",

          required: true,

          schema: {
            type: "string",
          },

          example:
            "507f1f77bcf86cd799439011",
        },
      ],

      responses: {
        200: {
          description:
            "Lấy calories thành công",

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
                    $ref:
                      "#/components/schemas/TodayKcalResponse",
                  },
                },
              },
            },
          },
        },

        401: {
          description:
            "Unauthorized - Token không hợp lệ",
        },

        500: {
          description:
            "Lỗi server",
        },
      },
    },
  },
};