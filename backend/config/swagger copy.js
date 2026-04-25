const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Nutrition App API",
      version: "1.0.0",
      description: "Tài liệu API cho hệ thống quản lý dinh dưỡng",
    },
    servers: [
      {
        url: "http://localhost:3000/api", // URL base của API
        description: "Local server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token từ login endpoint",
        },
      },
      schemas: {
        // ==================== AUTH SCHEMAS ====================
        SignupRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: {
              type: "string",
              example: "Nguyễn Văn A",
              description: "Tên người dùng",
            },
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
              description: "Email duy nhất",
            },
            password: {
              type: "string",
              minLength: 6,
              example: "password123",
              description: "Mật khẩu tối thiểu 6 ký tự",
            },
            age: {
              type: "number",
              example: 25,
              description: "Tuổi của người dùng",
            },
            gender: {
              type: "string",
              enum: ["male", "female", "other"],
              example: "male",
              description: "Giới tính",
            },
            height: {
              type: "number",
              example: 170,
              description: "Chiều cao (cm)",
            },
            weight: {
              type: "number",
              example: 70,
              description: "Cân nặng (kg)",
            },
            goal: {
              type: "string",
              enum: ["lose_weight", "maintain_weight", "gain_weight"],
              example: "lose_weight",
              description: "Mục tiêu sức khỏe",
            },
            allergies: {
              type: "array",
              items: { type: "string" },
              example: ["peanut", "shellfish"],
              description: "Danh sách dị ứng thực phẩm",
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
            },
            password: {
              type: "string",
              example: "password123",
            },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
              description: "Email để gửi OTP reset password",
            },
          },
        },
        VerifyResetPasswordOTPRequest: {
          type: "object",
          required: ["email", "otp"],
          properties: {
            email: {
              type: "string",
              format: "email",
            },
            otp: {
              type: "string",
              example: "123456",
              description: "OTP gồm 6 chữ số",
            },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["email", "otp", "newPassword"],
          properties: {
            email: {
              type: "string",
              format: "email",
            },
            otp: {
              type: "string",
              example: "123456",
            },
            newPassword: {
              type: "string",
              minLength: 6,
              example: "newpassword123",
            },
          },
        },
        SendVerificationOTPRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              description: "Email để gửi OTP xác thực",
            },
          },
        },
        VerifyEmailRequest: {
          type: "object",
          required: ["email", "otp"],
          properties: {
            email: {
              type: "string",
              format: "email",
            },
            otp: {
              type: "string",
              example: "123456",
              description: "OTP xác thực email",
            },
          },
        },
        ChangePasswordRequest: {
          type: "object",
          required: ["oldPassword", "newPassword"],
          properties: {
            oldPassword: {
              type: "string",
              example: "oldpassword123",
            },
            newPassword: {
              type: "string",
              minLength: 6,
              example: "newpassword123",
            },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
            token: {
              type: "string",
              description: "JWT token để dùng trong các request sau",
            },
            user: {
              $ref: "#/components/schemas/User",
            },
            requiresEmailVerification: {
              type: "boolean",
              description: "Có cần xác thực email hay không",
            },
          },
        },

        // ==================== USER SCHEMAS ====================
        User: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              format: "ObjectId",
              description: "ID người dùng",
            },
            name: {
              type: "string",
              example: "Nguyễn Văn A",
            },
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
            },
            role: {
              type: "string",
              enum: ["USER", "ADMIN"],
              example: "USER",
            },
            age: {
              type: "number",
              example: 25,
            },
            gender: {
              type: "string",
              enum: ["male", "female", "other"],
            },
            height: {
              type: "number",
              example: 170,
              description: "Chiều cao (cm)",
            },
            weight: {
              type: "number",
              example: 70,
              description: "Cân nặng (kg)",
            },
            goal: {
              type: "string",
              enum: ["lose_weight", "maintain_weight", "gain_weight"],
            },
            allergies: {
              type: "array",
              items: { type: "string" },
            },
            isEmailVerified: {
              type: "boolean",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        UpdateUserRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
            gender: { type: "string", enum: ["male", "female", "other"] },
            height: { type: "number" },
            weight: { type: "number" },
            goal: {
              type: "string",
              enum: ["lose_weight", "maintain_weight", "gain_weight"],
            },
            allergies: { type: "array", items: { type: "string" } },
          },
        },

        // ==================== INGREDIENT SCHEMAS ====================
        Ingredient: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              format: "ObjectId",
            },
            name: {
              type: "string",
              example: "Gà ngon",
              description: "Tên nguyên liệu (tiếng Việt)",
            },
            name_en: {
              type: "string",
              example: "chicken",
              description: "Tên tiếng Anh",
            },
            nutrition: {
              type: "object",
              properties: {
                calories: { type: "number", description: "Calo" },
                protein: { type: "number", description: "Protein (g)" },
                fat: { type: "number", description: "Chất béo (g)" },
                carbs: { type: "number", description: "Carbs (g)" },
                fiber: { type: "number", description: "Chất xơ (g)" },
                sugar: { type: "number", description: "Đường (g)" },
                sodium: { type: "number", description: "Natrium (mg)" },
              },
            },
            unit: {
              type: "string",
              example: "g",
              description: "Đơn vị cơ bản (g, kg, ml, l, cup...)",
            },
            category: {
              type: "string",
              enum: [
                "protein",
                "carb",
                "fat",
                "vegetable",
                "fruit",
                "dairy",
                "seasoning",
                "beverage",
                "other",
              ],
              example: "protein",
            },
            aliases: {
              type: "array",
              items: { type: "string" },
              example: ["gà", "thịt gà", "chicken breast"],
              description: "Các tên gọi khác",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        CreateIngredientRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              example: "Gà ngon",
            },
            name_en: {
              type: "string",
              example: "chicken",
            },
            nutrition: {
              $ref: "#/components/schemas/Nutrition",
            },
            unit: {
              type: "string",
              default: "g",
            },
            category: {
              type: "string",
              enum: [
                "protein",
                "carb",
                "fat",
                "vegetable",
                "fruit",
                "dairy",
                "seasoning",
                "beverage",
                "other",
              ],
            },
            aliases: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        Nutrition: {
          type: "object",
          properties: {
            calories: { type: "number" },
            protein: { type: "number" },
            fat: { type: "number" },
            carbs: { type: "number" },
            fiber: { type: "number" },
            sugar: { type: "number" },
            sodium: { type: "number" },
          },
        },

        // ==================== EXERCISE SCHEMAS ====================
        Exercise: {
          type: "object",
          properties: {
            exerciseId: {
              type: "number",
              example: 123,
              description: "ID bài tập",
            },
            name: {
              type: "string",
              example: "Chạy bộ",
              description: "Tên bài tập",
            },
            description: {
              type: "string",
              example: "Chạy 5km",
            },
            categoryId: {
              type: "number",
              nullable: true,
              example: 10,
              description: "ID category từ nguồn",
            },
            category: {
              type: "string",
              example: "Cardio",
            },
            muscles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  name: { type: "string" },
                  name_en: { type: "string" },
                },
              },
            },
            muscles_secondary: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  name: { type: "string" },
                  name_en: { type: "string" },
                },
              },
            },
            equipment: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  name: { type: "string" },
                },
              },
            },
            images: {
              type: "array",
              items: { type: "string", format: "uri" },
            },
            videos: {
              type: "array",
              items: { type: "string", format: "uri" },
            },
            activityType: {
              type: "string",
              enum: [
                "strength_training",
                "calisthenics",
                "cardio_machine",
                "hiit",
                "aerobic_dance",
                "yoga_stretching",
                "functional_training",
              ],
              example: "strength_training",
              description: "Loại hoạt động",
            },
            defaultIntensity: {
              type: "string",
              enum: ["light", "moderate", "vigorous"],
              example: "moderate",
              description: "Cường độ mặc định",
            },
          },
        },

        // ==================== RECIPE SCHEMAS ====================
        Recipe: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              format: "ObjectId",
            },
            name: {
              type: "string",
              example: "Cơm gà Hainanese",
              description: "Tên công thức",
            },
            description: {
              type: "string",
              example: "Cơm gà kiểu Singapore...",
            },
            category: {
              type: "string",
              enum: ["main", "side", "dessert", "drink"],
              example: "main",
            },
            instructions: {
              type: "array",
              items: { type: "string" },
              example: ["Luộc gà", "Xào cơm", "Dựng lên đĩa"],
              description: "Danh sách các bước nấu",
            },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredientId: {
                    type: "string",
                    format: "ObjectId",
                  },
                  name: { type: "string" },
                  quantity: {
                    type: "object",
                    properties: {
                      amount: { type: "number" },
                      unit: {
                        type: "string",
                        enum: [
                          "g",
                          "kg",
                          "l",
                          "ml",
                          "cup",
                          "tbsp",
                          "tsp",
                          "unit",
                        ],
                      },
                    },
                  },
                },
              },
            },
            servings: {
              type: "number",
              example: 2,
              description: "Số khẩu phần",
            },
            totalNutrition: {
              $ref: "#/components/schemas/Nutrition",
            },
            imageUrl: {
              type: "string",
              format: "uri",
            },
            createdBy: {
              type: "string",
              enum: ["admin", "user", "ai"],
            },
            verified: {
              type: "boolean",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        CreateRecipeRequest: {
          type: "object",
          required: ["name", "ingredients", "instructions"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            category: {
              type: "string",
              enum: ["main", "side", "dessert", "drink"],
            },
            instructions: { type: "array", items: { type: "string" } },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredientId: { type: "string" },
                  name: { type: "string" },
                  quantity: {
                    type: "object",
                    properties: {
                      amount: { type: "number" },
                      unit: { type: "string" },
                    },
                  },
                },
              },
            },
            servings: { type: "number" },
          },
        },
        RecipeStats: {
          type: "object",
          properties: {
            totalRecipes: { type: "number" },
            byCategory: {
              type: "object",
              properties: {
                main: { type: "number" },
                side: { type: "number" },
                dessert: { type: "number" },
                drink: { type: "number" },
              },
            },
          },
        },
        SubstituteIngredient: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              format: "ObjectId",
            },
            name: {
              type: "string",
              example: "Thịt gà",
              description: "Tên nguyên liệu thay thế",
            },
            description: {
              type: "string",
              example: "Có thể thay thế bằng thịt heo",
              description: "Mô tả về sự thay thế",
            },
            nutritionDiff: {
              type: "object",
              description: "Chênh lệch dinh dưỡng so với nguyên liệu gốc",
              properties: {
                calories: { type: "number" },
                protein: { type: "number" },
                carbs: { type: "number" },
                fat: { type: "number" },
              },
            },
          },
        },
        NutritionInfo: {
          type: "object",
          properties: {
            calories: { type: "number", example: 500 },
            protein: { type: "number", example: 30 },
            carbs: { type: "number", example: 50 },
            fat: { type: "number", example: 20 },
            fiber: { type: "number", example: 5 },
            sugar: { type: "number", example: 10 },
            sodium: { type: "number", example: 300 },
          },
        },
        RecipeInput: {
          type: "object",
          required: ["name", "ingredients", "instructions"],
          properties: {
            name: {
              type: "string",
              example: "Cơm gà Hainanese",
              description: "Tên công thức",
            },
            description: {
              type: "string",
              example: "Cơm gà kiểu Singapore",
              description: "Mô tả công thức",
            },
            category: {
              type: "string",
              enum: ["main", "side", "dessert", "drink"],
              example: "main",
              description: "Loại món ăn",
            },
            instructions: {
              type: "array",
              items: { type: "string" },
              example: ["Luộc gà", "Xào cơm", "Dựng lên đĩa"],
              description: "Danh sách các bước nấu",
            },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredientId: {
                    type: "string",
                    format: "ObjectId",
                    description: "ID nguyên liệu",
                  },
                  name: {
                    type: "string",
                    description: "Tên nguyên liệu",
                  },
                  quantity: {
                    type: "object",
                    properties: {
                      amount: {
                        type: "number",
                        example: 200,
                        description: "Số lượng",
                      },
                      unit: {
                        type: "string",
                        enum: ["g", "kg", "l", "ml", "cup", "tbsp", "tsp", "unit"],
                        example: "g",
                        description: "Đơn vị",
                      },
                    },
                  },
                },
              },
            },
            servings: {
              type: "number",
              example: 2,
              description: "Số khẩu phần",
            },
            imageUrl: {
              type: "string",
              format: "uri",
              example: "https://example.com/image.jpg",
              description: "URL hình ảnh món ăn",
            },
          },
        },

        // ==================== NUTRITION GOAL SCHEMAS ====================
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

        // ==================== DAILY MENU SCHEMAS ====================
        DailyMenu: {
          type: "object",
          properties: {
            _id: { type: "string", format: "ObjectId" },
            userId: { type: "string", format: "ObjectId" },

            date: {
              type: "string",
              format: "date",
              example: "2025-02-13",
            },

            recipes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  _id: { type: "string", format: "ObjectId" },

                  recipeId: { type: "string", format: "ObjectId" },

                  name: { type: "string" },
                  imageUrl: { type: "string" },
                  description: { type: "string" },

                  mealSource: {
                    type: "string",
                    enum: [
                      "chicken",
                      "pork",
                      "beef",
                      "seafood",
                      "egg",
                      "tofu",
                      "other",
                      "pho",
                      "bun",
                      "mi",
                      "none",
                    ],
                  },

                  scale: { type: "number", example: 1 },

                  nutrition: {
                    $ref: "#/components/schemas/Nutrition",
                  },

                  servingTime: {
                    type: "string",
                    enum: ["breakfast", "lunch", "dinner", "snack", "other"],
                  },

                  isChecked: { type: "boolean" },
                },
              },
            },

            totalNutrition: {
              $ref: "#/components/schemas/Nutrition",
            },

            targetNutrition: {
              $ref: "#/components/schemas/Nutrition",
            },

            status: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
            },

            feedback: { type: "string" },

            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateDailyMenuRequest: {
          type: "object",
          required: ["date"],
          properties: {
            date: {
              type: "string",
              format: "date",
              example: "2025-02-13",
            },
            recipes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  recipeId: { type: "string" },
                  portion: { type: "number" },
                  servingTime: {
                    type: "string",
                    enum: ["breakfast", "lunch", "dinner", "other"],
                  },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        AddRecipeRequest: {
          type: "object",
          required: ["date", "recipeId"],
          properties: {
            date: {
              type: "string",
              format: "date",
              example: "2025-02-13",
            },

            dailyMenuId: {
              type: "string",
              format: "ObjectId",
            },

            recipeId: {
              type: "string",
              format: "ObjectId",
            },

            scale: {
              type: "number",
              default: 1,
            },

            servingTime: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "snack", "other"],
              default: "other",
            },
          },
        },
        UpdateRecipeRequest: {
          type: "object",
          required: ["date", "dailyMenuId", "recipeItemId"],
          properties: {
            date: { type: "string", format: "date" },
            dailyMenuId: { type: "string", format: "ObjectId" },
            recipeItemId: { type: "string", format: "ObjectId" },

            newScale: {
              type: "number",
              minimum: 0,
            },

            checked: {
              type: "boolean",
            },
          },
        },
        DeleteRecipeRequest: {
          type: "object",
          required: ["dailyMenuId", "recipeItemId"],
          properties: {
            dailyMenuId: {
              type: "string",
              format: "ObjectId",
              description: "ID của daily menu",
            },
            recipeItemId: {
              type: "string",
              format: "ObjectId",
              description: "ID của món ăn trong menu cần xóa",
            },
          },
        },
        UpdateStatusRequest: {
          type: "object",
          required: ["dailyMenuId", "newStatus"],
          properties: {
            dailyMenuId: {
              type: "string",
              format: "ObjectId",
              description: "ID của daily menu",
            },
            newStatus: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
              description: "Trạng thái mới của thực đơn",
            },
          },
        },
        CreateDailyMenuV2Request: {
          type: "object",
          required: ["date"],
          properties: {
            date: {
              type: "string",
              format: "date",
              example: "2025-02-13",
              description: "Ngày cần tạo menu theo định dạng YYYY-MM-DD",
            },
          },
        },

        // ==================== MEAL PLAN SCHEMAS ====================

        // ==================== SCHEMAS ====================

        // ─── MealPlan (summary, dùng trong list) ─────────────────────────────────────
        MealPlanSummary: {
          type: "object",
          description:
            "MealPlan rút gọn (dùng trong danh sách), dailyMenuIds chỉ có date + totalNutrition + status",
          properties: {
            _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
            userId: { type: "string", example: "663e1a2b3c4d5e6f7a8b9c0a" },
            startDate: {
              type: "string",
              format: "date",
              example: "2026-04-28",
            },
            endDate: { type: "string", format: "date", example: "2026-05-04" },
            source: {
              type: "string",
              enum: ["ai", "user"],
              description: "ai = do hệ thống gợi ý, user = tự tạo",
              example: "ai",
            },
            generatedBy: {
              type: "string",
              description: "Tên engine tạo plan (chỉ có khi source = ai)",
              example: "nutrition_ai_v2",
            },
            status: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
              example: "suggested",
            },
            dailyMenuIds: {
              type: "array",
              description:
                "Danh sách DailyMenu rút gọn (chỉ date, totalNutrition, status)",
              items: { $ref: "#/components/schemas/DailyMenuSummary" },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // ─── MealPlan (full, dùng trong detail) ──────────────────────────────────────
        MealPlan: {
          type: "object",
          description: "MealPlan đầy đủ (không populate recipe)",
          properties: {
            _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
            userId: { type: "string", example: "663e1a2b3c4d5e6f7a8b9c0a" },
            startDate: {
              type: "string",
              format: "date",
              example: "2026-04-28",
            },
            endDate: { type: "string", format: "date", example: "2026-05-04" },
            source: { type: "string", enum: ["ai", "user"], example: "user" },
            generatedBy: { type: "string", example: "nutrition_ai_v2" },
            status: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
              example: "manual",
            },
            dailyMenuIds: {
              type: "array",
              items: { type: "string" },
              description: "Mảng ObjectId của DailyMenu",
              example: ["664f1a2b3c4d5e6f7a8b9c01", "664f1a2b3c4d5e6f7a8b9c02"],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // ─── MealPlanDetail (populate đầy đủ) ────────────────────────────────────────
        MealPlanDetail: {
          type: "object",
          description: "MealPlan với DailyMenu và Recipe populate đầy đủ",
          properties: {
            _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
            userId: { type: "string", example: "663e1a2b3c4d5e6f7a8b9c0a" },
            startDate: {
              type: "string",
              format: "date",
              example: "2026-04-28",
            },
            endDate: { type: "string", format: "date", example: "2026-05-04" },
            source: { type: "string", enum: ["ai", "user"], example: "ai" },
            generatedBy: { type: "string", example: "nutrition_ai_v2" },
            status: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
              example: "suggested",
            },
            dailyMenuIds: {
              type: "array",
              description: "DailyMenu đã populate đầy đủ Recipe",
              items: { $ref: "#/components/schemas/DailyMenuDetail" },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // ─── DailyMenuSummary (dùng trong MealPlanSummary) ───────────────────────────
        DailyMenuSummary: {
          type: "object",
          properties: {
            _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c01" },
            date: { type: "string", format: "date", example: "2026-04-28" },
            status: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
              example: "suggested",
            },
            totalNutrition: { $ref: "#/components/schemas/Nutrition" },
          },
        },

        // ─── DailyMenuDetail (populate recipe, dùng trong MealPlanDetail) ────────────
        DailyMenuDetail: {
          type: "object",
          properties: {
            _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c01" },
            date: { type: "string", format: "date", example: "2026-04-28" },
            status: {
              type: "string",
              enum: [
                "manual",
                "suggested",
                "selected",
                "completed",
                "deleted",
                "expired",
              ],
              example: "suggested",
            },
            totalNutrition: { $ref: "#/components/schemas/Nutrition" },
            targetNutrition: { $ref: "#/components/schemas/Nutrition" },
            recipes: {
              type: "array",
              items: { $ref: "#/components/schemas/RecipeItem" },
            },
            feedback: {
              type: "string",
              example: "Ổn, nhưng muốn đổi bữa sáng",
            },
          },
        },

        // ─── RecipeItem (1 món trong DailyMenu) ──────────────────────────────────────
        RecipeItem: {
          type: "object",
          properties: {
            _id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c11" },
            recipeId: {
              type: "object",
              description:
                "Recipe đã populate (hoặc chỉ là ObjectId nếu không populate)",
              properties: {
                _id: { type: "string" },
                name: { type: "string", example: "Bún bò Huế" },
                imageUrl: { type: "string", example: "https://..." },
                description: { type: "string" },
                totalNutrition: { $ref: "#/components/schemas/Nutrition" },
              },
            },
            name: { type: "string", example: "Bún bò Huế" },
            imageUrl: { type: "string", example: "https://..." },
            scale: {
              type: "number",
              description: "Hệ số khẩu phần (1 = 1 serving, 0.5 = nửa phần)",
              example: 1,
            },
            servingTime: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "snack", "other"],
              description: "Bữa ăn mà món này thuộc về",
              example: "breakfast",
            },
            nutrition: { $ref: "#/components/schemas/Nutrition" },
            isChecked: {
              type: "boolean",
              description: "User đã ăn món này chưa (dùng để tạo MealLog)",
              example: false,
            },
            status: {
              type: "string",
              enum: ["planned", "completed", "skipped"],
              example: "planned",
            },
          },
        },

        // ─── Nutrition ────────────────────────────────────────────────────────────────
        Nutrition: {
          type: "object",
          properties: {
            calories: { type: "number", example: 450.5 },
            protein: { type: "number", example: 35.2 },
            fat: { type: "number", example: 12.1 },
            carbs: { type: "number", example: 55.8 },
            fiber: { type: "number", example: 4.5 },
            sugar: { type: "number", example: 8.2 },
            sodium: { type: "number", example: 620 },
          },
        },

        // ─── Request schemas ──────────────────────────────────────────────────────────
        CreateMealPlanRequest: {
          type: "object",
          required: ["startDate"],
          properties: {
            startDate: {
              type: "string",
              format: "date",
              description: "Ngày bắt đầu plan (YYYY-MM-DD)",
              example: "2026-04-28",
            },
            period: {
              type: "string",
              enum: ["week"],
              default: "week",
              description: "Hiện tại chỉ hỗ trợ 'week' (7 ngày)",
              example: "week",
            },
          },
        },

        RecommendWeekRequest: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              format: "date",
              description:
                "Ngày bắt đầu gợi ý (YYYY-MM-DD). Mặc định là hôm nay.",
              example: "2026-04-28",
            },
            days: {
              type: "integer",
              minimum: 1,
              maximum: 14,
              default: 7,
              description: "Số ngày cần gợi ý (1–14, mặc định 7)",
              example: 7,
            },
            saveToDB: {
              type: "boolean",
              default: true,
              description: `Có lưu kết quả vào DB không.
- \`true\` (mặc định): Tạo DailyMenu + MealPlan, trả về data + planId để frontend dùng tiếp
- \`false\`: Chỉ tính toán, không lưu — dùng để preview trước khi confirm`,
              example: true,
            },
          },
        },

        // ─── WeekRecommendationResult ─────────────────────────────────────────────────
        WeekRecommendationResult: {
          type: "object",
          description: "Kết quả gợi ý thực đơn tuần từ AI",
          properties: {
            startDate: {
              type: "string",
              format: "date-time",
              example: "2026-04-28T00:00:00.000Z",
            },
            endDate: {
              type: "string",
              format: "date-time",
              example: "2026-05-04T00:00:00.000Z",
            },
            goal: {
              type: "string",
              description: "Mục tiêu dinh dưỡng của user",
              example: "maintain_weight",
            },
            tdee: {
              type: "number",
              description: "Tổng năng lượng tiêu hao hàng ngày (kcal)",
              example: 2396,
            },
            dailyTarget: {
              $ref: "#/components/schemas/Nutrition",
            },
            weekPlan: {
              type: "array",
              items: { $ref: "#/components/schemas/DayPlan" },
            },
            weeklyTotal: { $ref: "#/components/schemas/NutritionSimple" },
            weeklyAverage: { $ref: "#/components/schemas/NutritionSimple" },
          },
        },

        // ─── DayPlan (1 ngày trong WeekRecommendationResult) ─────────────────────────
        DayPlan: {
          type: "object",
          properties: {
            dayIndex: {
              type: "integer",
              description: "Thứ tự ngày (1–7)",
              example: 1,
            },
            date: {
              type: "string",
              format: "date-time",
              example: "2026-04-28T00:00:00.000Z",
            },
            recipes: {
              type: "array",
              description:
                "Danh sách món ăn flat, phân biệt bữa qua servingTime",
              items: { $ref: "#/components/schemas/RecipeItem" },
            },
            totalNutrition: { $ref: "#/components/schemas/NutritionSimple" },
            targetNutrition: { $ref: "#/components/schemas/Nutrition" },
          },
        },

        // ─── NutritionSimple (calories/protein/fat/carbs only) ───────────────────────
        NutritionSimple: {
          type: "object",
          description: "Dinh dưỡng cơ bản (4 chỉ số chính)",
          properties: {
            calories: { type: "number", example: 2400 },
            protein: { type: "number", example: 184.1 },
            fat: { type: "number", example: 58.1 },
            carbs: { type: "number", example: 310.6 },
          },
        },

        // ==================== FAVORITE SCHEMAS ====================
        Favorite: {
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
            recipeId: {
              type: "string",
              format: "ObjectId",
            },
            recipeSnapshot: {
              $ref: "#/components/schemas/Recipe",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // ==================== AUDIT LOG SCHEMAS ====================
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
              enum: [
                "User",
                "Ingredient",
                "Recipe",
                "DailyMenu",
                "MealPlan",
                "Auth",
              ],
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

        // ==================== ERROR SCHEMAS ====================
        ErrorResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        PaginationResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: { type: "array" },
            pagination: {
              type: "object",
              properties: {
                page: { type: "number" },
                limit: { type: "number" },
                total: { type: "number" },
              },
            },
          },
        },
      },
    },
    paths: {
      // ==================== AUTH ENDPOINTS ====================
      "/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Đăng ký tài khoản mới",
          description: "Tạo tài khoản người dùng mới với email và mật khẩu",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignupRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Đăng ký thành công, OTP đã được gửi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthResponse" },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ hoặc email đã tồn tại",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Lỗi server",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Đăng nhập",
          description:
            "Xác thực người dùng bằng email và mật khẩu, trả về JWT token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Đăng nhập thành công",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthResponse" },
                },
              },
            },
            401: {
              description: "Email hoặc mật khẩu không đúng",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Lỗi server",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Quên mật khẩu",
          description: "Gửi OTP đến email để reset mật khẩu",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "OTP đã được gửi đến email",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Email không tồn tại",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/verify-reset-password-otp": {
        post: {
          tags: ["Auth"],
          summary: "Xác thực OTP reset password",
          description: "Kiểm tra OTP hợp lệ",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VerifyResetPasswordOTPRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "OTP hợp lệ",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            400: {
              description: "OTP không hợp lệ hoặc hết hạn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Reset mật khẩu",
          description: "Thay đổi mật khẩu với OTP hợp lệ",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Mật khẩu đã được reset thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Request không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/send-verification-otp": {
        post: {
          tags: ["Auth"],
          summary: "Gửi OTP xác thực email",
          description: "Gửi OTP để xác thực email đăng ký",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SendVerificationOTPRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "OTP đã được gửi",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/verify-email": {
        post: {
          tags: ["Auth"],
          summary: "Xác thực email",
          description: "Xác thực email người dùng với OTP",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifyEmailRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Email đã xác thực thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/resend-verification-otp": {
        post: {
          tags: ["Auth"],
          summary: "Gửi lại OTP xác thực",
          description: "Gửi lại OTP nếu người dùng không nhận được",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SendVerificationOTPRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "OTP đã được gửi lại",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/resend-reset-password-otp": {
        post: {
          tags: ["Auth"],
          summary: "Gửi lại OTP reset password",
          description: "Gửi lại OTP nếu người dùng không nhận được",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SendVerificationOTPRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "OTP đã được gửi lại",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Lấy thông tin người dùng hiện tại",
          description: "Lấy thông tin profile của người dùng đã đăng nhập",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Thông tin người dùng",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
            401: {
              description: "Chưa xác thực",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/change-password": {
        put: {
          tags: ["Auth"],
          summary: "Đổi mật khẩu",
          description: "Thay đổi mật khẩu của người dùng đã đăng nhập",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangePasswordRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Mật khẩu đã được thay đổi",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            401: {
              description: "Mật khẩu cũ không đúng",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // ==================== USER ENDPOINTS ====================
      "/users": {
        get: {
          tags: ["Users"],
          summary: "Lấy danh sách tất cả users (ADMIN ONLY)",
          description: "Chỉ ADMIN mới có thể lấy danh sách tất cả người dùng",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Danh sách người dùng",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
            403: {
              description: "Không có quyền truy cập",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/users/{id}": {
        get: {
          tags: ["Users"],
          summary: "Lấy thông tin user theo ID",
          description:
            "USER chỉ có thể xem thông tin của chính mình, ADMIN có thể xem ai cũng được",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của người dùng",
            },
          ],
          responses: {
            200: {
              description: "Thông tin người dùng",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
            403: {
              description: "Không có quyền xem thông tin này",
            },
            404: {
              description: "Người dùng không tồn tại",
            },
          },
        },
        put: {
          tags: ["Users"],
          summary: "Cập nhật thông tin user",
          description:
            "USER chỉ có thể cập nhật thông tin của chính mình, ADMIN có thể cập nhật ai cũng được",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateUserRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Thông tin user đã được cập nhật",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            403: {
              description: "Không có quyền cập nhật",
            },
            404: {
              description: "Người dùng không tồn tại",
            },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Xóa user (ADMIN ONLY)",
          description: "Xóa tài khoản người dùng",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Người dùng đã được xóa",
            },
            403: {
              description: "Không có quyền xóa",
            },
            404: {
              description: "Người dùng không tồn tại",
            },
          },
        },
      },

      // ==================== INGREDIENT ENDPOINTS ====================
      "/ingredients": {
        get: {
          tags: ["Ingredients"],
          summary: "Lấy danh sách tất cả nguyên liệu",
          description: "Trả về danh sách tất cả nguyên liệu trong hệ thống",
          responses: {
            200: {
              description: "Danh sách nguyên liệu",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Ingredient" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Ingredients"],
          summary: "Tạo nguyên liệu mới (ADMIN ONLY)",
          description: "Thêm nguyên liệu mới vào hệ thống",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateIngredientRequest",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Nguyên liệu đã được tạo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Ingredient" },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ",
            },
          },
        },
      },
      "/ingredients/{id}": {
        get: {
          tags: ["Ingredients"],
          summary: "Lấy chi tiết nguyên liệu",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Chi tiết nguyên liệu",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Ingredient" },
                },
              },
            },
            404: {
              description: "Nguyên liệu không tồn tại",
            },
          },
        },
        put: {
          tags: ["Ingredients"],
          summary: "Cập nhật nguyên liệu (ADMIN ONLY)",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateIngredientRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Nguyên liệu đã được cập nhật",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Ingredient" },
                },
              },
            },
            404: {
              description: "Nguyên liệu không tồn tại",
            },
          },
        },
        delete: {
          tags: ["Ingredients"],
          summary: "Xóa nguyên liệu (ADMIN ONLY)",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Nguyên liệu đã được xóa",
            },
            404: {
              description: "Nguyên liệu không tồn tại",
            },
          },
        },
      },
      "/ingredients/search": {
        get: {
          tags: ["Ingredients"],
          summary: "Tìm kiếm nguyên liệu",
          description: "Tìm kiếm nguyên liệu theo tên hoặc từ khóa",
          parameters: [
            {
              in: "query",
              name: "keyword",
              required: true,
              schema: { type: "string" },
              description: "Từ khóa tìm kiếm",
            },
          ],
          responses: {
            200: {
              description: "Danh sách nguyên liệu tìm được",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Ingredient" },
                  },
                },
              },
            },
          },
        },
      },
      "/ingredients/stats": {
        get: {
          tags: ["Ingredients"],
          summary: "Lấy thống kê nguyên liệu (ADMIN ONLY)",
          responses: {
            200: {
              description: "Thống kê nguyên liệu",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalIngredients: { type: "number" },
                      byCategory: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ingredients/check-duplicate": {
        get: {
          tags: ["Ingredients"],
          summary: "Kiểm tra tên nguyên liệu có bị trùng không",
          parameters: [
            {
              in: "query",
              name: "name",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Kết quả kiểm tra",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      duplicate: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ==================== EXERCISE ENDPOINTS ====================
      "/exercises": {
        get: {
          tags: ["Exercise"],
          summary: "Lấy danh sách exercise",
          description:
            "Lấy toàn bộ exercises hoặc filter theo categoryId, muscleIds, equipmentIds",
          parameters: [
            {
              in: "query",
              name: "categoryId",
              schema: { type: "number" },
              description: "ID thể loại exercise",
            },
            {
              in: "query",
              name: "muscleIds",
              schema: { type: "string" },
              description: "IDs cơ bắp, ngăn cách dấu phẩy (ví dụ: 1,2,3)",
            },
            {
              in: "query",
              name: "equipmentIds",
              schema: { type: "string" },
              description: "IDs thiết bị, ngăn cách dấu phẩy (ví dụ: 1,2)",
            },
          ],
          responses: {
            200: {
              description: "Danh sách exercises",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Exercise" },
                  },
                },
              },
            },
          },
        },
      },
      "/exercises/import": {
        post: {
          tags: ["Exercise"],
          summary: "Import exercises từ nguồn bên ngoài",
          responses: {
            201: {
              description: "Import thành công",
            },
            500: {
              description: "Lỗi server",
            },
          },
        },
      },
      "/exercises/{id}": {
        get: {
          tags: ["Exercise"],
          summary: "Lấy exercise theo id",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "number" },
            },
          ],
          responses: {
            200: {
              description: "Thông tin exercise",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Exercise" },
                },
              },
            },
            404: {
              description: "Exercise không tồn tại",
            },
          },
        },
      },

      // ==================== RECIPE ENDPOINTS ====================
      "/recipes": {
        get: {
          tags: ["Recipes"],
          summary: "Lấy danh sách tất cả các món ăn với đầy đủ thông tin",
          description:
            "Trả về danh sách công thức với hỗ trợ search, filter, sort và pagination (công khai)",
          parameters: [
            {
              in: "query",
              name: "search",
              schema: { type: "string" },
              description: "Từ khóa tìm kiếm",
            },
            {
              in: "query",
              name: "category",
              schema: {
                type: "string",
                enum: ["main", "side", "dessert", "drink", "all"],
              },
              description: "Lọc theo danh mục",
            },
            {
              in: "query",
              name: "page",
              schema: { type: "number", default: 1 },
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "number", default: 20 },
            },
            {
              in: "query",
              name: "sortBy",
              schema: { type: "string", default: "createdAt" },
            },
            {
              in: "query",
              name: "sortOrder",
              schema: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
              },
            },
          ],
          responses: {
            200: {
              description: "Danh sách công thức",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                  schema: { $ref: "#/components/schemas/PaginationResponse" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Recipes"],
          summary: "Tạo công thức nấu ăn mới (Admin only)",
          description: "Thêm công thức nấu ăn mới vào hệ thống (yêu cầu quyền Admin)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateRecipeRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Công thức đã được tạo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ",
            },
            401: { description: "Chưa xác thực" },
            403: { description: "Không có quyền Admin" },
          },
        },
      },

      // ==================== RECIPE AUTHENTICATED ENDPOINTS ====================
        get: {
          tags: ["Recipes"],
          summary: "Lấy thông tin một món ăn theo tên",
          description: "Tìm kiếm công thức theo tên món ăn (công khai)",
          parameters: [
            {
              in: "path",
              name: "foodName",
              required: true,
              schema: { type: "string" },
              description: "Tên món ăn",
            },
          ],
          responses: {
            200: {
              description: "Chi tiết món ăn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                },
              },
            },
            404: {
              description: "Công thức không tồn tại",
            },
          },
        },
        put: {
          tags: ["Recipes"],
          summary: "Cập nhật món ăn (Admin only)",
          description: "Cập nhật thông tin công thức (yêu cầu quyền Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của công thức",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateRecipeRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Công thức đã được cập nhật",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                },
              },
            },
            401: { description: "Chưa xác thực" },
            403: { description: "Không có quyền Admin" },
            404: {
              description: "Công thức không tồn tại",
            },
          },
        },
        delete: {
          tags: ["Recipes"],
          summary: "Xóa công thức (Admin only)",
          description: "Xóa một công thức (yêu cầu quyền Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của công thức",
            },
          ],
          responses: {
            200: {
              description: "Công thức đã được xóa",
            },
            401: { description: "Chưa xác thực" },
            403: { description: "Không có quyền Admin" },
            404: {
              description: "Công thức không tồn tại",
            },
          },
        },
      },
      "/recipes/search-by-ingredient": {
        get: {
          tags: ["Recipes"],
          summary: "Tìm kiếm công thức theo nguyên liệu",
          description: "Tìm tất cả công thức chứa nguyên liệu nhất định",
          parameters: [
            {
              in: "query",
              name: "keyword",
              required: true,
              schema: { type: "string" },
              description: "Tên nguyên liệu",
            },
            {
              in: "query",
              name: "page",
              schema: { type: "number", default: 1 },
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "number", default: 20 },
            },
          ],
          responses: {
            200: {
              description: "Danh sách công thức",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaginationResponse" },
                },
              },
            },
          },
        },
      },
      "/recipes/search-by-image": {
        post: {
          tags: ["Recipes"],
          summary: "Tìm kiếm công thức từ ảnh",
          description:
            "Tải lên ảnh thực phẩm để nhận dạng và tìm công thức tương tự",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    image: {
                      type: "string",
                      format: "binary",
                      description: "Ảnh thực phẩm",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Danh sách công thức tìm được",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaginationResponse" },
                },
              },
            },
          },
        },
      },
      "/recipes/stats": {
        get: {
          tags: ["Recipes"],
          summary: "Lấy thống kê công thức",
          responses: {
            200: {
              description: "Thống kê công thức",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RecipeStats" },
                },
              },
            },
          },
        },
      },
      "/recipes/check-duplicate": {
        get: {
          tags: ["Recipes"],
          summary: "Kiểm tra tên công thức có bị trùng không",
          parameters: [
            {
              in: "query",
              name: "name",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Kết quả kiểm tra",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      duplicate: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ==================== RECIPE AUTHENTICATED ENDPOINTS ====================
      "/recipes/id/{id}": {
        get: {
          tags: ["Recipes"],
          summary: "Lấy thông tin một món ăn theo ID",
          description: "Trả về thông tin chi tiết của một món ăn dựa trên ID (cần đăng nhập)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của món ăn",
            },
          ],
          responses: {
            200: {
              description: "Chi tiết món ăn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                },
              },
            },
            401: { description: "Chưa xác thực" },
            404: { description: "Công thức không tồn tại" },
          },
        },
      },

      "/recipes/rcm/{foodName}": {
        get: {
          tags: ["Recipes"],
          summary: "Tìm nguyên liệu và hướng dẫn bằng AI",
          description: "Sử dụng AI để tìm nguyên liệu thay thế và hướng dẫn chi tiết cho một món ăn (cần đăng nhập)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "foodName",
              required: true,
              schema: { type: "string" },
              description: "Tên món ăn",
            },
          ],
          responses: {
            200: {
              description: "Thông tin nguyên liệu và hướng dẫn",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ingredients: { type: "array", items: { type: "string" } },
                      instructions: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            401: { description: "Chưa xác thực" },
          },
        },
      },
      "/recipes/substitutions": {
        post: {
          tags: ["Recipes"],
          summary: "Tìm nguyên liệu thay thế",
          description: "Tìm các nguyên liệu thay thế cho một nguyên liệu cụ thể (cần đăng nhập)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ingredientName"],
                  properties: {
                    ingredientName: {
                      type: "string",
                      description: "Tên nguyên liệu cần tìm thay thế",
                      example: "thịt bò",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Danh sách nguyên liệu thay thế",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/SubstituteIngredient" },
                  },
                },
              },
            },
            401: { description: "Chưa xác thực" },
          },
        },
      },
      "/recipes/ingredients": {
        post: {
          tags: ["Recipes"],
          summary: "Tìm nguyên liệu bằng AI",
          description: "Sử dụng AI để phân tích và tìm thông tin nguyên liệu (cần đăng nhập)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: {
                      type: "string",
                      description: "Câu hỏi về nguyên liệu",
                      example: "Thịt gà có những loại dinh dưỡng gì?",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Thông tin nguyên liệu",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: { type: "string" },
                    },
                  },
                },
              },
            },
            401: { description: "Chưa xác thực" },
          },
        },
      },
      "/recipes/detect": {
        post: {
          tags: ["Recipes"],
          summary: "Nhận diện món ăn từ hình ảnh",
          description: "Sử dụng AI để nhận diện món ăn từ hình ảnh (cần đăng nhập)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["foodImage"],
                  properties: {
                    foodImage: {
                      type: "string",
                      format: "binary",
                      description: "Hình ảnh món ăn",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Thông tin món ăn nhận diện được",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      foodName: { type: "string" },
                      ingredients: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            401: { description: "Chưa xác thực" },
          },
        },
      },
      "/recipes/back-up-nutrition": {
        post: {
          tags: ["Recipes"],
          summary: "Lấy thông tin dinh dưỡng dự phòng",
          description: "Lấy thông tin dinh dưỡng từ nguồn dự phòng (cần đăng nhập)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["recipeName"],
                  properties: {
                    recipeName: {
                      type: "string",
                      description: "Tên công thức",
                      example: "Cơm gà",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Thông tin dinh dưỡng",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/NutritionInfo" },
                },
              },
            },
            401: { description: "Chưa xác thực" },
          },
        },
      },

      // ==================== RECIPE ADMIN ENDPOINTS ====================
      "/recipes": {
        post: {
          tags: ["Recipes"],
          summary: "Tạo mới công thức (Admin only)",
          description: "Tạo một công thức mới (yêu cầu quyền Admin)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecipeInput" },
              },
            },
          },
          responses: {
            201: {
              description: "Công thức được tạo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                },
              },
            },
            401: { description: "Chưa xác thực" },
            403: { description: "Không có quyền Admin" },
          },
        },
      },
      "/recipes/{id}": {
        put: {
          tags: ["Recipes"],
          summary: "Cập nhật công thức (Admin only)",
          description: "Cập nhật thông tin công thức (yêu cầu quyền Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của công thức",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecipeInput" },
              },
            },
          },
          responses: {
            200: {
              description: "Công thức được cập nhật",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipe" },
                },
              },
            },
            401: { description: "Chưa xác thực" },
            403: { description: "Không có quyền Admin" },
            404: { description: "Công thức không tồn tại" },
          },
        },
        delete: {
          tags: ["Recipes"],
          summary: "Xóa công thức (Admin only)",
          description: "Xóa một công thức (yêu cầu quyền Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của công thức",
            },
          ],
          responses: {
            200: {
              description: "Xóa thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            401: { description: "Chưa xác thực" },
            403: { description: "Không có quyền Admin" },
            404: { description: "Công thức không tồn tại" },
          },
        },
      },

      // ==================== NUTRITION GOAL ENDPOINTS ====================
      "/nutrition-goals": {
        get: {
          tags: ["Nutrition Goals"],
          summary: "Lấy danh sách mục tiêu dinh dưỡng",
          description: "Lấy tất cả mục tiêu dinh dưỡng của người dùng hiện tại",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Danh sách mục tiêu",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/NutritionGoal" },
                  },
                },
              },
            },
            401: {
              description: "Chưa xác thực",
            },
          },
        },
      },
      "/nutrition-goals/active": {
        get: {
          tags: ["Nutrition Goals"],
          summary: "Lấy mục tiêu dinh dưỡng hiện tại",
          description: "Lấy mục tiêu dinh dưỡng đang hoạt động",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Mục tiêu dinh dưỡng hiện tại",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/NutritionGoal" },
                },
              },
            },
            404: {
              description: "Không có mục tiêu nào đang hoạt động",
            },
          },
        },
      },

      // ==================== DAILY MENU ENDPOINTS ====================
      "/daily-menu/add-recipe": {
        post: {
          tags: ["Daily Menu"],
          summary: "Thêm công thức vào thực đơn hàng ngày",
          description:
            "Thêm một công thức vào thực đơn hàng ngày của người dùng",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddRecipeRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Thêm món ăn thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/DailyMenu" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/update-status": {
        patch: {
          tags: ["Daily Menu"],
          summary: "Cập nhật trạng thái thực đơn",
          description:
            "Cập nhật trạng thái của thực đơn hàng ngày (manual, suggested, selected, completed, deleted, expired)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateStatusRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Cập nhật trạng thái thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/DailyMenu" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/update-recipe": {
        patch: {
          tags: ["Daily Menu"],
          summary: "Cập nhật món ăn trong thực đơn",
          description:
            "Cập nhật thông tin món ăn (số khẩu phần, trạng thái checked) trong thực đơn hàng ngày",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateRecipeRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Cập nhật món ăn thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/DailyMenu" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/delete-recipe": {
        delete: {
          tags: ["Daily Menu"],
          summary: "Xóa món ăn khỏi thực đơn",
          description: "Xóa một món ăn khỏi thực đơn hàng ngày",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteRecipeRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Xóa món ăn thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/DailyMenu" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/recommendations/day": {
        post: {
          tags: ["Daily Menu"],
          summary: "Gợi ý thực đơn hàng ngày",
          description:
            "Sử dụng AI để gợi ý thực đơn hàng ngày dựa trên mục tiêu dinh dưỡng và sở thích của người dùng",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateDailyMenuV2Request",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Gợi ý thực đơn thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { $ref: "#/components/schemas/DailyMenu" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Lỗi khi gợi ý thực đơn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/by-date": {
        get: {
          tags: ["Daily Menu"],
          summary: "Lấy thực đơn theo ngày",
          description: "Lấy thực đơn của người dùng theo một ngày cụ thể",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "date",
              required: true,
              schema: {
                type: "string",
                format: "date",
                example: "2025-02-13",
              },
              description: "Ngày cần lấy thực đơn (YYYY-MM-DD)",
            },
          ],
          responses: {
            200: {
              description: "Lấy thực đơn thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: {
                        type: "string",
                        example: "Lấy thực đơn theo ngày thành công",
                      },
                      data: {
                        $ref: "#/components/schemas/DailyMenu",
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Lỗi khi lấy thực đơn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/by-range": {
        get: {
          tags: ["Daily Menu"],
          summary: "Lấy danh sách thực đơn theo khoảng ngày",
          description:
            "Lấy danh sách thực đơn của người dùng trong một khoảng thời gian",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "startDate",
              required: true,
              schema: {
                type: "string",
                format: "date",
                example: "2025-02-01",
              },
              description: "Ngày bắt đầu (YYYY-MM-DD)",
            },
            {
              in: "query",
              name: "endDate",
              required: true,
              schema: {
                type: "string",
                format: "date",
                example: "2025-02-07",
              },
              description: "Ngày kết thúc (YYYY-MM-DD)",
            },
          ],
          responses: {
            200: {
              description: "Lấy danh sách thực đơn thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: {
                        type: "string",
                        example: "Lấy danh sách thực đơn thành công",
                      },
                      data: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/DailyMenu",
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Lỗi khi lấy danh sách thực đơn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // ==================== MEAL PLAN ENDPOINTS ====================
      "/meal-plans": {
        get: {
          tags: ["Meal Plans"],
          summary: "Lấy danh sách MealPlan của user",
          description: `Trả về tất cả MealPlan của user đang đăng nhập, sắp xếp theo startDate mới nhất.
Mỗi plan bao gồm danh sách DailyMenu (chỉ có date, totalNutrition, status — không populate recipe chi tiết).
 
**Dùng khi:** Hiển thị lịch sử / danh sách các tuần đã tạo plan.
 
**Filter theo status (query param):**
- \`suggested\` — plan do AI gợi ý, chưa được user chọn
- \`selected\` — plan đang được áp dụng
- \`completed\` — plan đã hoàn thành
- \`manual\` — plan user tự tạo
- \`deleted\` — đã xóa mềm
- \`expired\` — bị expire khi user chọn plan khác cùng thời gian`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              schema: {
                type: "string",
                enum: [
                  "manual",
                  "suggested",
                  "selected",
                  "completed",
                  "deleted",
                  "expired",
                ],
              },
              required: false,
              description:
                "Lọc theo trạng thái plan. Không truyền = lấy tất cả.",
              example: "selected",
            },
          ],
          responses: {
            200: {
              description: "Danh sách MealPlan",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MealPlanSummary" },
                      },
                    },
                  },
                },
              },
            },
            401: {},
          },
        },

        // ─── POST /mealplans ────────────────────────────────────────────────────────
        post: {
          tags: ["Meal Plans"],
          summary: "Tạo MealPlan thủ công",
          description: `Tạo 1 MealPlan do user tự lên lịch (không dùng AI).
 
**Logic xử lý:**
- Sinh danh sách ngày từ \`startDate\` theo \`period\` (mặc định 7 ngày)
- Mỗi ngày: nếu đã có DailyMenu (status là selected hoặc manual) → reuse; chưa có → tạo DailyMenu rỗng
- Trả về MealPlan với \`source: "user"\`, \`status: "manual"\`
 
**Sau khi tạo xong**, dùng API của DailyMenu (\`POST /dailymenus/add-recipe\`) để thêm món vào từng ngày.`,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateMealPlanRequest" },
                example: {
                  startDate: "2026-04-28",
                  period: "week",
                },
              },
            },
          },
          responses: {
            201: {
              description: "MealPlan đã được tạo thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/MealPlan" },
                    },
                  },
                },
              },
            },
            400: {},
            401: {},
          },
        },
      },
      // ─── GET /mealplans/by-startdate ─────────────────────────────────────────────
      "/meal-plans/by-startdate": {
        get: {
          tags: ["Meal Plans"],
          summary: "Lấy MealPlan theo ngày bắt đầu",
          description: `Tìm MealPlan của user theo \`startDate\`. Trả về plan đầu tiên khớp (populate đầy đủ DailyMenu + Recipe chi tiết).
 
**Dùng khi:** User mở màn hình xem thực đơn tuần, frontend biết startDate của tuần hiện tại.
 
> ⚠️ Nếu không tìm thấy plan → trả về 404. Frontend nên gọi \`GET /mealplans/status\` trước để check.`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "startDate",
              schema: { type: "string", format: "date" },
              required: true,
              description: "Ngày bắt đầu của plan (YYYY-MM-DD)",
              example: "2026-04-28",
            },
          ],
          responses: {
            200: {
              description: "MealPlan với đầy đủ DailyMenu và Recipe",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/MealPlanDetail" },
                    },
                  },
                },
              },
            },
            400: {},
            401: {},
            404: {},
          },
        },
      },
      // ─── GET /mealplans/status ───────────────────────────────────────────────────
      "/meal-plans/status": {
        get: {
          tags: ["Meal Plans"],
          summary: "Kiểm tra tuần đã có DailyMenu chưa",
          description: `Kiểm tra xem trong khoảng N ngày từ \`startDate\`, ngày nào đã có DailyMenu tồn tại.
 
**Dùng khi:** Trước khi gọi AI gợi ý tuần (\`POST /mealplans/recommendations/week\`), frontend nên gọi API này để:
- Nếu \`hasExisting: false\` → gọi AI luôn
- Nếu \`hasExisting: true\` → hiển thị cảnh báo "Một số ngày đã có thực đơn, bạn có muốn tạo mới không?"
 
> ℹ️ API gợi ý AI sẽ **luôn tạo DailyMenu mới** (không reuse), nên cần confirm với user trước.`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "startDate",
              schema: { type: "string", format: "date" },
              required: true,
              description: "Ngày bắt đầu kiểm tra (YYYY-MM-DD)",
              example: "2026-04-28",
            },
            {
              in: "query",
              name: "days",
              schema: { type: "integer", default: 7, minimum: 1, maximum: 14 },
              required: false,
              description: "Số ngày cần kiểm tra (mặc định 7)",
              example: 7,
            },
          ],
          responses: {
            200: {
              description: "Kết quả kiểm tra",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "object",
                        properties: {
                          hasExisting: {
                            type: "boolean",
                            description:
                              "true nếu có ít nhất 1 ngày đã có DailyMenu",
                            example: true,
                          },
                          existingDates: {
                            type: "array",
                            items: { type: "string", format: "date" },
                            description: "Danh sách ngày đã có DailyMenu",
                            example: ["2026-04-28", "2026-04-29"],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {},
            401: {},
          },
        },
      },
      // ─── GET /mealplans/:planId ──────────────────────────────────────────────────
      "/meal-plans/{planId}": {
        get: {
          tags: ["Meal Plans"],
          summary: "Lấy chi tiết MealPlan theo ID",
          description: `Trả về đầy đủ thông tin MealPlan: populate tất cả DailyMenu và Recipe trong từng ngày.
 
**Dùng khi:** Xem chi tiết 1 plan cụ thể (ví dụ sau khi AI gợi ý xong, hiển thị để user review trước khi chọn).`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "planId",
              schema: { type: "string" },
              required: true,
              description: "MongoDB ObjectId của MealPlan",
              example: "664f1a2b3c4d5e6f7a8b9c0d",
            },
          ],
          responses: {
            200: {
              description: "Chi tiết MealPlan",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/MealPlanDetail" },
                    },
                  },
                },
              },
            },
            400: {},
            401: {},
            404: {},
          },
        },

      },
      // ─── PATCH /mealplans/:planId/status ─────────────────────────────────────────
      "/meal-plans/{planId}/status": {
        patch: {
          tags: ["Meal Plans"],
          summary: "Cập nhật trạng thái MealPlan",
          description: `Cập nhật status của MealPlan.
 
**Luồng status thông thường:**
\`\`\`
suggested → selected → completed
manual    → selected → completed
\`\`\`
 
**Ràng buộc quan trọng:**
- Không thể cập nhật plan đã ở trạng thái \`completed\` hoặc \`deleted\`
- Khi chuyển sang \`selected\`: các plan \`suggested\` khác của cùng user bị **overlap thời gian** sẽ tự động chuyển sang \`expired\`
 
**Các giá trị status hợp lệ:**
 
| Status | Ý nghĩa |
|--------|---------|
| \`manual\` | Plan thủ công, chưa hoàn thiện |
| \`suggested\` | AI vừa gợi ý, chờ user xem xét |
| \`selected\` | User đã chọn plan này để thực hiện |
| \`completed\` | Đã hoàn thành toàn bộ plan |
| \`deleted\` | Đã xóa mềm (dùng DELETE thay vì PATCH) |
| \`expired\` | Hết hạn do user chọn plan khác |`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "planId",
              schema: { type: "string" },
              required: true,
              description: "MongoDB ObjectId của MealPlan",
              example: "664f1a2b3c4d5e6f7a8b9c0d",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: {
                      type: "string",
                      enum: [
                        "manual",
                        "suggested",
                        "selected",
                        "completed",
                        "expired",
                      ],
                      description: "Trạng thái mới muốn cập nhật",
                      example: "selected",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Cập nhật thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/MealPlan" },
                    },
                  },
                },
              },
            },
            400: {},
            401: {},
            404: {},
          },
        },
      },
      // ─── POST /mealplans/recommendations/week ────────────────────────────────────
      "/meal-plans/recommendations/week": {
        post: {
          tags: ["Meal Plans"],
          summary: "AI gợi ý thực đơn cả tuần",
          description: `Gọi engine AI (nutrition_ai_v2) để tạo thực đơn tối ưu cho N ngày liên tiếp.
 
**Thuật toán:**
- Dựa trên TDEE, mục tiêu dinh dưỡng (NutritionGoal active) và lịch sử ăn uống của user
- Tính \`adaptiveTarget\` bù trừ dư/thiếu từ các ngày trước để cân bằng dinh dưỡng cả tuần
- Tránh lặp món trong 7 ngày gần nhất, ưu tiên món user yêu thích
- Mỗi ngày gồm 3 bữa: breakfast (~25% calories), lunch (~35%), dinner (~30%)
 
**Điều kiện tiên quyết:**
- User phải có \`NutritionGoal\` với \`status: "active"\`
 
**Lưu ý:**
- API này **luôn tạo DailyMenu mới** cho mỗi ngày (upsert theo userId + date)
- Nên gọi \`GET /mealplans/status\` trước để cảnh báo user nếu đã có thực đơn
- Tạo 1 MealPlan với \`source: "ai"\`, \`status: "suggested"\`
- Sau khi xem kết quả, user gọi \`PATCH /mealplans/:planId/status\` với \`status: "selected"\` để xác nhận`,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecommendWeekRequest" },
                example: {
                  startDate: "2026-04-28",
                  days: 7,
                  saveToDB: true,
                },
              },
            },
          },
          responses: {
            200: {
              description: "Kết quả gợi ý thực đơn tuần",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        $ref: "#/components/schemas/WeekRecommendationResult",
                      },
                    },
                  },
                },
              },
            },
            400: {},
            401: {},
          },
        },
      },

      // ==================== FAVORITE ENDPOINTS ====================
      "/favorites": {
        get: {
          tags: ["Favorites"],
          summary: "Lấy danh sách công thức yêu thích",
          description: "Lấy tất cả công thức được lưu yêu thích",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Danh sách công thức yêu thích",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Favorite" },
                  },
                },
              },
            },
          },
        },
      },
      "/favorites/{recipeId}": {
        post: {
          tags: ["Favorites"],
          summary: "Thêm công thức vào yêu thích",
          description: "Lưu một công thức vào danh sách yêu thích",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "recipeId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            201: {
              description: "Công thức đã được lưu",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Favorite" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Favorites"],
          summary: "Xóa công thức khỏi yêu thích",
          description: "Bỏ một công thức khỏi danh sách yêu thích",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "recipeId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Công thức đã được xóa khỏi yêu thích",
            },
          },
        },
      },
      "/favorites/check/{recipeId}": {
        get: {
          tags: ["Favorites"],
          summary: "Kiểm tra công thức có trong yêu thích không",
          description:
            "Kiểm tra xem công thức đó có trong danh sách yêu thích không",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "recipeId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Kết quả kiểm tra",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      isFavorite: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/favorites/toggle/{recipeId}": {
        post: {
          tags: ["Favorites"],
          summary: "Toggle (bật/tắt) yêu thích",
          description: "Thêm hoặc xóa công thức khỏi yêu thích (toggle)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "recipeId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Trạng thái yêu thích đã được thay đổi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Favorite" },
                },
              },
            },
          },
        },
      },

      // ==================== UPLOAD IMAGE ENDPOINTS ====================
      "/upload-image": {
        post: {
          tags: ["Upload"],
          summary: "Tải lên ảnh",
          description:
            "Tải lên ảnh (công thức, nguyên liệu, avatar...) lên Cloudinary",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["image"],
                  properties: {
                    image: {
                      type: "string",
                      format: "binary",
                      description: "File ảnh",
                    },
                    type: {
                      type: "string",
                      enum: ["recipe", "ingredient", "avatar", "general"],
                      default: "general",
                      description: "Loại ảnh (tùy chọn)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Ảnh đã được tải lên",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      url: { type: "string", format: "uri" },
                      public_id: { type: "string" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Không có file hoặc file không hợp lệ",
            },
          },
        },
      },

      // ==================== AUDIT LOG ENDPOINTS ====================
      "/audit-logs": {
        get: {
          tags: ["Audit Logs"],
          summary: "Lấy danh sách audit logs (ADMIN ONLY)",
          description: "Xem nhật ký tất cả hoạt động hệ thống",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Danh sách audit logs",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/AuditLog" },
                  },
                },
              },
            },
            403: {
              description: "Chỉ ADMIN mới có quyền truy cập",
            },
          },
        },
      },
      "/audit-logs/{id}": {
        get: {
          tags: ["Audit Logs"],
          summary: "Lấy chi tiết một audit log (ADMIN ONLY)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Chi tiết audit log",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuditLog" },
                },
              },
            },
            403: {
              description: "Chỉ ADMIN mới có quyền truy cập",
            },
            404: {
              description: "Audit log không tồn tại",
            },
          },
        },
      },

      // ==================== DASHBOARD ENDPOINTS ====================
      "/admin/dashboard/stats": {
        get: {
          tags: ["Dashboard"],
          summary: "Lấy thống kê dashboard",
          description: "Lấy dữ liệu thống kê cho dashboard (ADMIN và USER)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Dữ liệu thống kê dashboard",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      donutChart: { type: "object" },
                      lineChart: { type: "object" },
                    },
                  },
                },
              },
            },
            401: {
              description: "Chưa xác thực",
            },
          },
        },
      },
    },
  apis: [],
};

const specs = swaggerJsdoc(options);
module.exports = specs;
