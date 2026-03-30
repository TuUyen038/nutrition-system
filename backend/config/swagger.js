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
            fitnessLevel: {
              type: "string",
              enum: ["sedentary", "beginner", "intermediate", "advanced", "athlete"],
              example: "intermediate",
              description: "Mức độ fitness (ít hoạt động, mới bắt đầu, trung cấp, nâng cao, vận động viên)",
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
            fitnessLevel: {
              type: "string",
              enum: ["sedentary", "beginner", "intermediate", "advanced", "athlete"],
              example: "intermediate",
              description: "Mức độ fitness",
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
            goal: { type: "string", enum: ["lose_weight", "maintain_weight", "gain_weight"] },
            fitnessLevel: { type: "string", enum: ["sedentary", "beginner", "intermediate", "advanced", "athlete"] },
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
              enum: ["protein", "carb", "fat", "vegetable", "fruit", "dairy", "seasoning", "beverage", "other"],
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
              enum: ["protein", "carb", "fat", "vegetable", "fruit", "dairy", "seasoning", "beverage", "other"],
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
                "functional_training"
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

        // ==================== WORKOUT SESSION SCHEMAS ====================
        WorkoutSession: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              format: "ObjectId",
              description: "ID của phiên tập",
            },
            userId: {
              type: "string",
              format: "ObjectId",
              description: "ID của người dùng",
            },
            exerciseId: {
              type: "number",
              example: 1,
              description: "ID của bài tập",
            },
            intensity: {
              type: "string",
              enum: ["light", "moderate", "vigorous"],
              example: "moderate",
              description: "Cường độ tập luyện",
            },
            startTime: {
              type: "string",
              format: "date-time",
              description: "Thời gian bắt đầu phiên tập",
            },
            endTime: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Thời gian kết thúc phiên tập",
            },
            durationMinutes: {
              type: "number",
              nullable: true,
              description: "Thời lượng tập luyện (phút)",
            },
            kcalBurned: {
              type: "number",
              nullable: true,
              description: "Lượng calo tiêu thụ",
            },
          },
        },
        StartWorkoutRequest: {
          type: "object",
          required: ["userId", "exerciseId", "intensity"],
          properties: {
            userId: {
              type: "string",
              format: "ObjectId",
              description: "ID của người dùng",
            },
            exerciseId: {
              type: "number",
              example: 1,
              description: "ID của bài tập",
            },
            intensity: {
              type: "string",
              enum: ["light", "moderate", "vigorous"],
              example: "moderate",
              description: "Cường độ tập luyện",
            },
          },
        },
        StopWorkoutRequest: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: {
              type: "string",
              format: "ObjectId",
              description: "ID của phiên tập cần kết thúc",
            },
          },
        },
        TodayKcalResponse: {
          type: "object",
          properties: {
            totalKcal: {
              type: "number",
              example: 245.5,
              description: "Tổng calo tiêu thụ trong ngày",
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
                        enum: ["g", "kg", "l", "ml", "cup", "tbsp", "tsp", "unit"],
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
            category: { type: "string", enum: ["main", "side", "dessert", "drink"] },
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
            _id: {
              type: "string",
              format: "ObjectId",
            },
            userId: {
              type: "string",
              format: "ObjectId",
            },
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
                  recipeId: { type: "string", format: "ObjectId" },
                  portion: { type: "number", description: "Số khẩu phần" },
                  servingTime: {
                    type: "string",
                    enum: ["breakfast", "lunch", "dinner", "other"],
                  },
                  status: {
                    type: "string",
                    enum: ["planned", "eaten", "deleted"],
                  },
                  note: { type: "string" },
                },
              },
            },
            totalNutrition: {
              $ref: "#/components/schemas/Nutrition",
            },
            status: {
              type: "string",
              enum: ["planned", "selected", "suggested", "completed", "deleted", "edited"],
              description: "suggested: từ AI gợi ý, selected: user chọn, edited: đã chỉnh sửa",
            },
            feedback: { type: "string" },
            createdAt: {
              type: "string",
              format: "date-time",
            },
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
          required: ["recipeId", "servingTime"],
          properties: {
            recipeId: { type: "string", format: "ObjectId" },
            portion: { type: "number", default: 1 },
            servingTime: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "other"],
            },
            note: { type: "string" },
          },
        },

        // ==================== MEAL PLAN SCHEMAS ====================
        MealPlan: {
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
            startDate: {
              type: "string",
              format: "date",
              example: "2025-02-13",
            },
            endDate: {
              type: "string",
              format: "date",
              example: "2025-02-19",
            },
            dailyMenuIds: {
              type: "array",
              items: { type: "string", format: "ObjectId" },
            },
            source: {
              type: "string",
              enum: ["ai", "user"],
            },
            generatedBy: {
              type: "string",
              example: "nutrition_ai_v1",
            },
            status: {
              type: "string",
              enum: ["suggested", "planned", "completed", "cancelled"],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        CreateMealPlanRequest: {
          type: "object",
          required: ["startDate"],
          properties: {
            startDate: {
              type: "string",
              format: "date",
              example: "2025-02-13",
            },
            endDate: {
              type: "string",
              format: "date",
              example: "2025-02-19",
            },
            dailyMenuIds: {
              type: "array",
              items: { type: "string" },
            },
            source: {
              type: "string",
              enum: ["ai", "user"],
            },
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
              enum: ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "VERIFY", "UNVERIFY", "PASSWORD_RESET_REQUEST", "PASSWORD_RESET"],
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
          description: "Xác thực người dùng bằng email và mật khẩu, trả về JWT token",
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
                schema: { $ref: "#/components/schemas/VerifyResetPasswordOTPRequest" },
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
                schema: { $ref: "#/components/schemas/SendVerificationOTPRequest" },
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
                schema: { $ref: "#/components/schemas/SendVerificationOTPRequest" },
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
                schema: { $ref: "#/components/schemas/SendVerificationOTPRequest" },
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
          description: "USER chỉ có thể xem thông tin của chính mình, ADMIN có thể xem ai cũng được",
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
          description: "USER chỉ có thể cập nhật thông tin của chính mình, ADMIN có thể cập nhật ai cũng được",
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
                schema: { $ref: "#/components/schemas/CreateIngredientRequest" },
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
                schema: { $ref: "#/components/schemas/CreateIngredientRequest" },
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
          description: "Lấy toàn bộ exercises hoặc filter theo categoryId, muscleIds, equipmentIds",
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
          summary: "Lấy danh sách công thức nấu ăn",
          description: "Trả về danh sách công thức với hỗ trợ search, filter, sort và pagination",
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
              schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
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
        post: {
          tags: ["Recipes"],
          summary: "Tạo công thức nấu ăn mới",
          description: "Thêm công thức nấu ăn mới vào hệ thống",
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
          },
        },
      },
      "/recipes/{id}": {
        get: {
          tags: ["Recipes"],
          summary: "Lấy chi tiết công thức",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
              description: "Tên công thức",
            },
          ],
          responses: {
            200: {
              description: "Chi tiết công thức",
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
          summary: "Cập nhật công thức",
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
            404: {
              description: "Công thức không tồn tại",
            },
          },
        },
        delete: {
          tags: ["Recipes"],
          summary: "Xóa công thức",
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
              description: "Công thức đã được xóa",
            },
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
          description: "Tải lên ảnh thực phẩm để nhận dạng và tìm công thức tương tự",
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
      "/daily-menu": {
        post: {
          tags: ["Daily Menu"],
          summary: "Tạo menu hàng ngày",
          description: "Tạo menu cho một ngày cụ thể",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateDailyMenuRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Menu đã được tạo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/recipes": {
        get: {
          tags: ["Daily Menu"],
          summary: "Lấy công thức theo ngày và trạng thái",
          description: "Lấy danh sách công thức trong menu theo ngày và trạng thái",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "date",
              required: true,
              schema: { type: "string", format: "date" },
            },
            {
              in: "query",
              name: "status",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Danh sách công thức",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Recipe" },
                  },
                },
              },
            },
          },
        },
      },
      "/daily-menu/history": {
        get: {
          tags: ["Daily Menu"],
          summary: "Lấy lịch sử menu",
          description: "Lấy danh sách menu trong quá khứ",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Lịch sử menu",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/DailyMenu" },
                  },
                },
              },
            },
          },
        },
      },
      "/daily-menu/add-recipe": {
        post: {
          tags: ["Daily Menu"],
          summary: "Thêm công thức vào menu",
          description: "Thêm một công thức vào menu hàng ngày",
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
              description: "Công thức đã được thêm",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/{mealId}/status": {
        put: {
          tags: ["Daily Menu"],
          summary: "Cập nhật trạng thái bữa ăn",
          description: "Thay đổi trạng thái bữa ăn (planned, eaten, deleted...)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "mealId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: ["planned", "eaten", "deleted"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Trạng thái đã được cập nhật",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/{mealId}": {
        put: {
          tags: ["Daily Menu"],
          summary: "Cập nhật menu hàng ngày",
          description: "Chỉnh sửa thông tin menu",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "mealId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateDailyMenuRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Menu đã được cập nhật",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DailyMenu" },
                },
              },
            },
          },
        },
      },
      "/daily-menu/suggest": {
        post: {
          tags: ["Daily Menu"],
          summary: "Gợi ý menu hàng ngày (AI)",
          description: "Sử dụng AI để gợi ý menu dựa trên mục tiêu và sở thích",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    date: { type: "string", format: "date" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Menu được gợi ý",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DailyMenu" },
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
          summary: "Lấy danh sách kế hoạch bữa ăn",
          description: "Lấy tất cả kế hoạch bữa ăn của người dùng",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Danh sách kế hoạch bữa ăn",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/MealPlan" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Meal Plans"],
          summary: "Tạo kế hoạch bữa ăn mới",
          description: "Tạo kế hoạch bữa ăn (có thể từ AI hoặc user tự tạo)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateMealPlanRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Kế hoạch đã được tạo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
          },
        },
      },
      "/meal-plans/{planId}": {
        get: {
          tags: ["Meal Plans"],
          summary: "Lấy chi tiết kế hoạch bữa ăn",
          description: "Lấy thông tin đầy đủ của một kế hoạch cụ thể",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "planId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Chi tiết kế hoạch bữa ăn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
            404: {
              description: "Kế hoạch không tồn tại",
            },
          },
        },
        delete: {
          tags: ["Meal Plans"],
          summary: "Xóa kế hoạch bữa ăn",
          description: "Xóa kế hoạch (chỉ có thể xóa kế hoạch ở trạng thái 'suggested')",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "planId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          responses: {
            200: {
              description: "Kế hoạch đã được xóa",
            },
            404: {
              description: "Kế hoạch không tồn tại",
            },
          },
        },
      },
      "/meal-plans/by-startdate": {
        get: {
          tags: ["Meal Plans"],
          summary: "Lấy kế hoạch theo ngày bắt đầu",
          description: "Tìm kế hoạch dựa trên ngày bắt đầu",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "startDate",
              required: true,
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            200: {
              description: "Kế hoạch bữa ăn",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
          },
        },
      },
      "/meal-plans/status": {
        get: {
          tags: ["Meal Plans"],
          summary: "Lấy trạng thái tuần",
          description: "Lấy trạng thái của tất cả kế hoạch trong tuần",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Trạng thái tuần",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      week: { type: "string" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/meal-plans/{planId}/status": {
        patch: {
          tags: ["Meal Plans"],
          summary: "Cập nhật trạng thái kế hoạch",
          description: "Thay đổi trạng thái kế hoạch (suggested, planned, completed, cancelled)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "planId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: ["suggested", "planned", "completed", "cancelled"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Trạng thái đã được cập nhật",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
          },
        },
      },
      "/meal-plans/suggest": {
        post: {
          tags: ["Meal Plans"],
          summary: "Gợi ý kế hoạch bữa ăn theo tuần (AI)",
          description: "Sử dụng AI để gợi ý toàn bộ kế hoạch bữa ăn cho một tuần",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    startDate: { type: "string", format: "date" },
                    endDate: { type: "string", format: "date" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Kế hoạch được gợi ý",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MealPlan" },
                },
              },
            },
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
          description: "Kiểm tra xem công thức đó có trong danh sách yêu thích không",
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
          description: "Tải lên ảnh (công thức, nguyên liệu, avatar...) lên Cloudinary",
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

      // ==================== WORKOUT SESSION ENDPOINTS ====================
      "/workout-session/start": {
        post: {
          tags: ["Workout Session"],
          summary: "Bắt đầu phiên tập luyện",
          description: "Tạo một phiên tập luyện mới cho người dùng",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StartWorkoutRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Phiên tập đã được tạo thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/WorkoutSession" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dữ liệu không hợp lệ hoặc người dùng đã có phiên tập đang hoạt động",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: false },
                      message: { type: "string" },
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
      "/workout-session/stop": {
        post: {
          tags: ["Workout Session"],
          summary: "Kết thúc phiên tập luyện",
          description: "Kết thúc phiên tập luyện và tính toán calo tiêu thụ",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StopWorkoutRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Phiên tập đã được kết thúc thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/WorkoutSession" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Phiên tập không tồn tại hoặc đã kết thúc",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: false },
                      message: { type: "string" },
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
      "/workout-session/today-kcal": {
        get: {
          tags: ["Workout Session"],
          summary: "Lấy tổng calo tiêu thụ hôm nay",
          description: "Lấy tổng lượng calo đã tiêu thụ trong ngày của người dùng",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "userId",
              required: true,
              schema: { type: "string", format: "ObjectId" },
              description: "ID của người dùng",
            },
          ],
          responses: {
            200: {
              description: "Tổng calo tiêu thụ hôm nay",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { $ref: "#/components/schemas/TodayKcalResponse" },
                    },
                  },
                },
              },
            },
            401: {
              description: "Chưa xác thực",
            },
            500: {
              description: "Lỗi server",
            },
          },
        },
      },
    },
  },
  apis: [],
};

const specs = swaggerJsdoc(options);
module.exports = specs;
