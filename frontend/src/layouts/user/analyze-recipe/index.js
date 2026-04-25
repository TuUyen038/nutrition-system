import React, { useState, useRef, useMemo, useCallback } from "react";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import MDButton from "components/MDButton";
import {
  Card,
  CircularProgress,
  Box,
  Chip,
  Alert,
  Skeleton,
  Stack,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  findRecipeByFoodName,
  getBackUpNutrition,
  getIngredientsAndInstructionsInAi,
  getIngredientsInAi,
  createRecipe,
  getIngredientSubstitutions,
} from "../../../services/recipeApi";
import { fetchIngredientsNutrition } from "../../../services/mappingModelApi";
import { findIngredientById, getIngredients } from "../../../services/ingredientApi";
import { List, ListItem, ListItemText, ListItemIcon, Divider } from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import NutritionProgress from "./nutritionProgress";
import { addRecipeToDailyMenu, getRecipesByDateAndStatus } from "services/dailyMenuApi";
import { useToast } from "context/ToastContext";
import { getMe } from "services/authApi";
import {
  calculateDailyCalorieGoal,
  calculateConsumedCalories,
  calculateConsumedNutrition,
  generateRecipeWarnings,
  identifyIngredientsToSubstitute,
} from "helpers/nutritionUtils";

function AnalyzeRecipe() {
  const { showError, showSuccess } = useToast();
  const myId = localStorage.getItem("userId") || "68f4394c4d4cc568e6bc5daa"; // ID người dùng giả định
  const resultRef = useRef(null);
  const [searchParams] = useSearchParams();
  const foodName = searchParams.get("dish");
  const [ingredients, setIngredients] = useState([]);
  const [ingrIds, setIngrIds] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [backUpNutrition, setBackUpNutrition] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoading2, setIsLoading2] = useState(false);
  const [error, setError] = useState(null);
  const [totalNutrition, setTotalNutrition] = useState({});
  const [db, setBd] = useState(false);
  const [dishName, setDishName] = useState("");
  const [healthWarnings, setHealthWarnings] = useState([]);
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(false);
  const [isLoadingNutrition, setIsLoadingNutrition] = useState(false);
  const [isClick, setIsClick] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [todayMenu, setTodayMenu] = useState([]);
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState(0);
  const [consumedCalories, setConsumedCalories] = useState(0);
  const [recipeWarnings, setRecipeWarnings] = useState([]);
  const [servings, setServings] = useState(1); // Số khẩu phần
  const [substitutions, setSubstitutions] = useState([]); // Gợi ý nguyên liệu thay thế
  const [isLoadingSubstitutions, setIsLoadingSubstitutions] = useState(false);
  const [ingredientsNutrition, setIngredientsNutrition] = useState([]); // Nutrition data cho từng nguyên liệu
  //50  2 30 50 10 50 50 30 20 15 10 5 5 5 50 30
  useEffect(() => {
    let active = true;

    const fetchRecipe = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let recipeData = await findRecipeByFoodName(foodName);
        if (!recipeData) {
          console.log("Không tìm thấy trong CSDL. Chuyển sang tìm kiếm bằng AI.");
          recipeData = await getIngredientsAndInstructionsInAi(foodName);

          if (!recipeData || (!recipeData.ingredients && !recipeData.instructions)) {
            throw new Error("Không thể tìm thấy công thức hợp lệ từ bất kỳ nguồn nào.");
          }
          console.log("Tìm kiếm bằng AI:", recipeData);
          if (!active) return;
          const ingrs = recipeData.ingredients || [];
          const names = ingrs.map((ingr) => ({
            name: ingr.name,
            quantity: ingr.quantity
              ? `${ingr.quantity.amount || ""} ${ingr.quantity.unit || ""}`.trim()
              : "",
          }));
          // Cập nhật servings từ AI response
          if (recipeData.servings && recipeData.servings > 0) {
            setServings(recipeData.servings);
          }
        } else {
          setBd(true);
          // Lấy nutrition từ DB và chia cho servings nếu có
          const dbNutrition = recipeData.nutrition || {};
          const dbServings = recipeData.servings || 1;

          // Chia dinh dưỡng cho số khẩu phần để có dinh dưỡng cho 1 khẩu phần
          const nutritionPerServing = { ...dbNutrition };
          for (const key in nutritionPerServing) {
            if (typeof nutritionPerServing[key] === "number") {
              nutritionPerServing[key] =
                Math.round((nutritionPerServing[key] / dbServings) * 100) / 100;
            }
          }

          setTotalNutrition(nutritionPerServing);
        }

        if (!active) return;
        setIngredients(recipeData.ingredients || []);
        setInstructions(recipeData.instructions || []);
        setServings(recipeData.servings || 1); // Lưu số khẩu phần từ API
      } catch (err) {
        if (!active) return;
        console.error("Lỗi tìm kiếm công thức:", err);
        setError(err.message || "Đã xảy ra lỗi khi tìm công thức.");
        setIngredients([]);
        setInstructions([]);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    if (foodName) {
      fetchRecipe();
    }

    return () => {
      active = false;
      console.log("Unmounted");
    };
  }, [foodName]);

  const handleSave = async () => {
    // Kiểm tra điều kiện trước khi lưu
    if (!(dishName || foodName)) {
      showError("Vui lòng nhập tên món ăn");
      return;
    }

    if (!instructions || instructions.length === 0 || instructions.every((step) => !step.trim())) {
      showError("Vui lòng nhập công thức nấu ăn");
      return;
    }

    if (!ingredients || ingredients.length === 0) {
      showError('Vui lòng chọn "Phân tích dinh dưỡng" trước khi muốn lưu món ăn');
      return;
    }

    if (!totalNutrition || Object.keys(totalNutrition).length === 0) {
      showError("Vui lòng phân tích dinh dưỡng trước khi lưu");
      return;
    }

    // Kiểm tra tổng dinh dưỡng có hợp lệ không
    const hasValidNutrition = Object.values(totalNutrition).some((val) => val > 0);
    if (!hasValidNutrition) {
      showError("Dinh dưỡng không hợp lệ. Vui lòng phân tích lại.");
      return;
    }

    try {
      const recipePayload = {
        ownerId: myId,
        name: dishName || foodName || "Món ăn bạn thêm",
        imageUrl:
          "https://res.cloudinary.com/denhj5ubh/image/upload/v1762541471/foodImages/ml4njluxyrvhthnvx0xr.jpg",
        public_id: "foodImages/ml4njluxyrvhthnvx0xr",
        description: `Công thức cho món ${dishName || foodName || "không tên"}`,
        ingredients,
        instructions,
        createdBy: "user",
        totalNutrition,
        verified: false,
      };

      // Tạo recipe
      const createdRecipe = await createRecipe(recipePayload);
      console.log("Lưu công thức thành công:", createdRecipe);

      // Thêm vào daily menu
      const date = new Date();
      const recipeId = createdRecipe._id;

      const data = await addRecipeToDailyMenu({
        date,
        recipeId,
        portion: 1,
        note: "",
        servingTime: "other",
      });

      showSuccess("Đã thêm món ăn vào thực đơn thành công!");
    } catch (error) {
      console.error("❌ handleSave error:", error);

      // Xử lý các loại lỗi khác nhau
      let errorMessage = "Lưu công thức thất bại. Vui lòng thử lại.";

      if (error.response) {
        // Lỗi từ API response
        const status = error.response.status;
        if (status === 400) {
          errorMessage = "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin.";
        } else if (status === 401) {
          errorMessage = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
        } else if (status === 403) {
          errorMessage = "Bạn không có quyền thực hiện thao tác này.";
        } else if (status === 404) {
          errorMessage = "Không tìm thấy tài nguyên. Vui lòng thử lại.";
        } else if (status >= 500) {
          errorMessage = "Lỗi máy chủ. Vui lòng thử lại sau.";
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.";
      }

      showError(errorMessage);
    }
  };

  // Fetch user info and today's menu to calculate warnings
  const fetchUserInfoAndTodayMenu = async () => {
    try {
      // Fetch user info
      let user = null;
      try {
        user = await getMe();
      } catch (error) {
        console.error("Error fetching user info:", error);
        // Fallback to localStorage
        const userStr = localStorage.getItem("user");
        if (userStr) {
          user = JSON.parse(userStr);
        }
      }

      if (!user) return;

      setUserInfo(user);

      // Calculate and cache daily calorie goal
      const cacheKey = `dailyCalorieGoal_${user._id || user.id}`;
      let calorieGoal = localStorage.getItem(cacheKey);

      if (!calorieGoal || calorieGoal === "0") {
        // Calculate if not cached or invalid
        calorieGoal = calculateDailyCalorieGoal(
          user.age,
          user.gender,
          user.height,
          user.weight,
          user.goal
        );
        if (calorieGoal > 0) {
          localStorage.setItem(cacheKey, calorieGoal.toString());
        }
      } else {
        calorieGoal = parseInt(calorieGoal, 10);
      }

      setDailyCalorieGoal(calorieGoal);

      // Fetch today's menu
      const today = new Date();
      const todayMenuData = await getRecipesByDateAndStatus(
        today,
        today,
        undefined
      );

      setTodayMenu(todayMenuData || []);

      // Calculate consumed calories
      const consumed = calculateConsumedCalories(todayMenuData || []);
      setConsumedCalories(consumed);
    } catch (error) {
      console.error("Error fetching user info and today menu:", error);
    }
  };

  // Fetch user info and today menu when component mounts and when window gains focus
  useEffect(() => {
    // Fetch immediately on mount
    fetchUserInfoAndTodayMenu();

    // Refresh when window gains focus (user returns to this tab/page)
    const handleFocus = () => {
      fetchUserInfoAndTodayMenu();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []); // Chỉ chạy một lần khi mount

  // Generate recipe warnings when nutrition data is available
  useEffect(() => {
    if (
      totalNutrition &&
      Object.keys(totalNutrition).length > 0 &&
      ingredients &&
      ingredients.length > 0 &&
      userInfo &&
      dailyCalorieGoal > 0 &&
      todayMenu
    ) {
      // Calculate consumed nutrition from today's menu
      const consumedNutrition = calculateConsumedNutrition(todayMenu || []);

      const warnings = generateRecipeWarnings(
        totalNutrition,
        ingredients,
        userInfo,
        consumedNutrition,
        dailyCalorieGoal
      );

      // Sort warnings: allergy first (error), then nutrition warnings
      const sortedWarnings = warnings.sort((a, b) => {
        if (a.reasonType === "allergy") return -1;
        if (b.reasonType === "allergy") return 1;
        if (a.type === "error" && b.type !== "error") return -1;
        if (a.type !== "error" && b.type === "error") return 1;
        return 0;
      });

      setRecipeWarnings(sortedWarnings);
    } else {
      setRecipeWarnings([]);
    }
  }, [totalNutrition, ingredients, userInfo, dailyCalorieGoal, todayMenu]);

  // Combine all warnings and sort by priority (error > warning > info > success)
  const allWarnings = useMemo(() => {
    const combined = [...healthWarnings, ...recipeWarnings];
    const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
    return combined.sort((a, b) => {
      const aOrder = severityOrder[a.type] ?? 4;
      const bOrder = severityOrder[b.type] ?? 4;
      return aOrder - bOrder;
    });
  }, [healthWarnings, recipeWarnings]);

  // Validate substitutions using mapping API (memoized to avoid dependency issues)
  const validateSubstitutions = useCallback(
    async (aiSubstitutions, ingredientsData, nutritionData) => {
      if (!aiSubstitutions || !Array.isArray(aiSubstitutions)) {
        return [];
      }

      // Collect all suggestions from AI
      const allSuggestions = [];
      const suggestionMap = new Map(); // Map suggestion name -> {original, index}

      aiSubstitutions.forEach((sub, subIndex) => {
        if (sub.suggestions && Array.isArray(sub.suggestions)) {
          sub.suggestions.forEach((suggestion) => {
            if (suggestion && suggestion.trim()) {
              const normalized = suggestion.trim();
              if (!suggestionMap.has(normalized)) {
                allSuggestions.push({ name: normalized });
                suggestionMap.set(normalized, {
                  original: sub.original,
                  subIndex,
                  suggestion: normalized,
                });
              }
            }
          });
        }
      });

      // If no suggestions, return empty
      if (allSuggestions.length === 0) {
        return [];
      }

      // Call mapping API
      console.log(
        "🔄 [validateSubstitutions] Gọi mapping API cho",
        allSuggestions.length,
        "suggestions"
      );
      const mappingResults = await fetchIngredientsNutrition(allSuggestions, 3);

      // Process mapping results
      const validatedSubstitutionsMap = new Map(); // Map original -> {suggestions: [...], withMapping: [...], withoutMapping: [...]}

      mappingResults.forEach((mappingItem, index) => {
        const inputName = mappingItem.input?.name || allSuggestions[index]?.name;
        const suggestionInfo = suggestionMap.get(inputName);

        if (!suggestionInfo) return;

        const { original, subIndex } = suggestionInfo;
        const candidates = mappingItem.results || [];
        const topMatch = candidates[0];

        // Check if there's a valid match (exact match or high score >= 0.9)
        const hasValidMatch =
          topMatch && (topMatch.exact_alias_match || (topMatch.score && topMatch.score >= 0.9));

        if (!validatedSubstitutionsMap.has(original)) {
          validatedSubstitutionsMap.set(original, {
            original,
            suggestions: [], // Validated suggestions (có trong DB)
            suggestionsWithMapping: [], // Suggestions có mapping info
            suggestionsWithoutMapping: [], // Suggestions không có trong DB
          });
        }

        const subData = validatedSubstitutionsMap.get(original);

        if (hasValidMatch) {
          // Use mapped name from DB
          const mappedName = topMatch.name_vi || topMatch.name || inputName;
          subData.suggestions.push(mappedName);
          subData.suggestionsWithMapping.push({
            name: mappedName,
            mongoId: topMatch.mongo_id || topMatch.id,
            score: topMatch.score,
            exactMatch: topMatch.exact_alias_match || false,
            nutrition: topMatch.nutrition || null, // Lưu nutrition từ mapping result
          });
        } else {
          // No valid match, but keep for reference
          subData.suggestionsWithoutMapping.push(inputName);
        }
      });

      // Convert map to array and calculate nutrition notes
      const validatedSubstitutions = await Promise.all(
        Array.from(validatedSubstitutionsMap.values()).map(async (sub) => {
          const originalIngredient = ingredientsData?.find(
            (ing) => (ing.name || "").toLowerCase() === (sub.original || "").toLowerCase()
          );

          // Lấy reasonType từ AI substitutions để biết nguyên liệu này gây warning gì
          const aiSub = aiSubstitutions.find((s) => s.original === sub.original);
          const reasonType = aiSub?.reasonType || "";
          const isAllergy = reasonType === "allergy";

          // Tính note cho từng suggestion có trong DB
          const suggestionsWithNotes = await Promise.all(
            sub.suggestionsWithMapping.map(async (suggestionMapping) => {
              let note = null;

              // Nếu là dị ứng thì không tính note
              if (isAllergy) {
                return {
                  ...suggestionMapping,
                  note: null,
                };
              }

              // Chỉ tính note cho các trường hợp khác (fat, sodium, sugar)
              if (originalIngredient && originalIngredient.quantity && suggestionMapping.mongoId) {
                try {
                  // Lấy nutrition của nguyên liệu thay thế từ DB (nếu chưa có trong mapping result)
                  let subNutrition = suggestionMapping.nutrition;
                  if (!subNutrition) {
                    const subIngredient = await findIngredientById(suggestionMapping.mongoId);
                    subNutrition = subIngredient?.nutrition;
                  }

                  if (subNutrition) {
                    // Lấy amount của nguyên liệu ban đầu (đã chuyển sang gram)
                    const originalAmount = originalIngredient.quantity.amount || 0;
                    const originalUnit = (originalIngredient.quantity.unit || "g").toLowerCase();
                    let originalAmountInGram = originalAmount;
                    if (originalUnit === "kg") originalAmountInGram = originalAmount * 1000;
                    else if (originalUnit === "mg") originalAmountInGram = originalAmount / 1000;

                    // Tính factor cho nguyên liệu ban đầu
                    const originalFactor = originalAmountInGram / 100;

                    // Lấy nutrition của nguyên liệu ban đầu từ nutrition array
                    const originalNutritionIndex = ingredientsData?.findIndex(
                      (ing) => (ing.name || "").toLowerCase() === (sub.original || "").toLowerCase()
                    );
                    const originalNutrition = nutritionData?.[originalNutritionIndex]?.nutrition;

                    if (originalNutrition) {
                      // Chỉ tính note cho chất dinh dưỡng gây warning (dựa vào reasonType)
                      if (reasonType === "fat") {
                        const originalFat = (originalNutrition.fat || 0) * originalFactor;
                        const subFat = (subNutrition.fat || 0) * originalFactor;
                        const fatDiff = subFat - originalFat;
                        if (fatDiff < 0) {
                          note = `(-${Math.abs(fatDiff).toFixed(1)}g chất béo)`;
                        }
                      } else if (reasonType === "sodium") {
                        const originalSodium = (originalNutrition.sodium || 0) * originalFactor;
                        const subSodium = (subNutrition.sodium || 0) * originalFactor;
                        const sodiumDiff = subSodium - originalSodium;
                        if (sodiumDiff < 0) {
                          note = `(-${Math.abs(sodiumDiff).toFixed(0)}mg muối)`;
                        }
                      } else if (reasonType === "sugar") {
                        const originalSugar = (originalNutrition.sugar || 0) * originalFactor;
                        const subSugar = (subNutrition.sugar || 0) * originalFactor;
                        const sugarDiff = subSugar - originalSugar;
                        if (sugarDiff < 0) {
                          note = `(-${Math.abs(sugarDiff).toFixed(1)}g đường)`;
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn("Error calculating nutrition note:", error);
                }
              }

              return {
                ...suggestionMapping,
                note, // Thêm note vào suggestion (chỉ 1 chất dinh dưỡng)
              };
            })
          );

          return {
            original: sub.original,
            reason: aiSub?.reason || "",
            suggestions: sub.suggestions, // Only validated suggestions
            suggestionsWithMapping: suggestionsWithNotes, // Full mapping info với note
            suggestionsWithoutMapping: sub.suggestionsWithoutMapping, // Not in DB
          };
        })
      );

      console.log("✅ [validateSubstitutions] Kết quả:", {
        total: validatedSubstitutions.length,
        withMapping: validatedSubstitutions.reduce((sum, s) => sum + s.suggestions.length, 0),
        withoutMapping: validatedSubstitutions.reduce(
          (sum, s) => sum + s.suggestionsWithoutMapping.length,
          0
        ),
      });

      return validatedSubstitutions;
    },
    []
  );

  // Fetch substitutions when ingredients and userInfo are available
  useEffect(() => {
    if (
      ingredients &&
      ingredients.length > 0 &&
      userInfo &&
      totalNutrition &&
      Object.keys(totalNutrition).length > 0 &&
      allWarnings &&
      allWarnings.length > 0 &&
      !isLoadingSubstitutions
    ) {
      const fetchSubs = async () => {
        try {
          setIsLoadingSubstitutions(true);

          // Identify ingredients that need substitution based on warnings
          // Chỉ gọi nếu có warnings
          if (allWarnings.length === 0) {
            setSubstitutions([]);
            setIsLoadingSubstitutions(false);
            return;
          }

          const ingredientsToSubstitute = identifyIngredientsToSubstitute(
            allWarnings,
            ingredients,
            userInfo
          );

          // LOG: Frontend - Xác định nguyên liệu cần thay thế
          console.log("🟢 [Frontend] ===== XÁC ĐỊNH NGUYÊN LIỆU CẦN THAY THẾ =====");
          console.log("⚠️ allWarnings:", allWarnings);
          console.log("📦 ingredientsToSubstitute:", ingredientsToSubstitute);
          console.log("🔢 ingredientsToSubstitute count:", ingredientsToSubstitute.length);

          // If no ingredients need substitution, return early
          if (ingredientsToSubstitute.length === 0) {
            console.log("ℹ️ [Frontend] Không có nguyên liệu cần thay thế");
            setSubstitutions([]);
            setIsLoadingSubstitutions(false);
            return;
          }

          // Get user goal
          const userGoal = userInfo.goal || "maintain_weight";

          // Get instructions text
          const instructionsText = Array.isArray(instructions)
            ? instructions.join("\n")
            : instructions || "";

          // Get dish name
          const currentDishName = dishName || foodName || "";

          // LOG: Frontend - Data gửi cho API
          console.log("📤 [Frontend] ===== GỬI REQUEST ĐẾN API =====");
          console.log(
            "📦 ingredientsToSubstitute:",
            JSON.stringify(ingredientsToSubstitute, null, 2)
          );
          console.log("📋 ingredients count:", ingredients?.length || 0);
          console.log("🎯 userGoal:", userGoal);
          console.log("🍽️ dishName:", currentDishName);
          console.log("📝 instructions length:", instructionsText.length);

          // Call AI API with only ingredients that need substitution
          const aiResult = await getIngredientSubstitutions(
            ingredientsToSubstitute,
            ingredients,
            userGoal,
            instructionsText,
            currentDishName
          );

          // LOG: Frontend - Kết quả từ API
          console.log("📥 [Frontend] ===== KẾT QUẢ TỪ API =====");
          console.log("📦 aiResult:", JSON.stringify(aiResult, null, 2));
          console.log("🔢 substitutions count:", aiResult.substitutions?.length || 0);

          // Map reasonType từ ingredientsToSubstitute vào AI result
          const aiSubstitutionsWithReasonType = (aiResult.substitutions || []).map((aiSub) => {
            const originalIng = ingredientsToSubstitute.find(
              (ing) =>
                (ing.ingredient.name || "").toLowerCase() === (aiSub.original || "").toLowerCase()
            );
            return {
              ...aiSub,
              reasonType: originalIng?.reasonType || "unknown",
            };
          });

          // Validate substitutions using mapping API
          const validated = await validateSubstitutions(
            aiSubstitutionsWithReasonType,
            ingredients,
            ingredientsNutrition
          );

          // LOG: Frontend - Kết quả sau validation
          console.log("✅ [Frontend] ===== KẾT QUẢ SAU VALIDATION =====");
          console.log("📦 validated:", JSON.stringify(validated, null, 2));
          console.log("🔢 validated count:", validated.length);
          console.log("==========================================");

          setSubstitutions(validated);
        } catch (error) {
          console.error("Error fetching substitutions:", error);
          setSubstitutions([]);
        } finally {
          setIsLoadingSubstitutions(false);
        }
      };

      fetchSubs();
    } else {
      setSubstitutions([]);
    }
  }, [
    ingredients,
    userInfo,
    totalNutrition,
    instructions,
    allWarnings,
    dishName,
    foodName,
    validateSubstitutions,
  ]);

  /**
   * Phân tích cảnh báo sức khỏe dựa trên dinh dưỡng cho 1 khẩu phần
   * @deprecated Không dùng nữa - đã thay thế bằng generateRecipeWarnings
   * generateRecipeWarnings xử lý đúng logic: chỉ cảnh báo nếu vượt quá lượng nạp trong ngày
   * Hàm này dùng ngưỡng cố định, không dựa trên lượng còn lại user có thể nạp
   */
  // const analyzeHealthWarnings = (nutrition) => {
  //   const warnings = [];
  //
  //   if (!nutrition || Object.keys(nutrition).length === 0) {
  //     return warnings;
  //   }
  //
  //   // Ngưỡng cho 1 khẩu phần (serving)
  //   // Calories: > 600 kcal cho 1 serving là cao
  //   if (nutrition.calories > 600) {
  //     warnings.push({
  //       type: "warning",
  //       message:
  //         "Món ăn có hàm lượng calo cao cho 1 khẩu phần. Nên chia thành nhiều bữa hoặc kết hợp vận động.",
  //     });
  //   }
  //
  //   // Sodium: > 1000 mg cho 1 serving là cao (khuyến nghị hàng ngày ~2300mg)
  //   if (nutrition.sodium > 1000) {
  //     warnings.push({
  //       type: "error",
  //       message: "Hàm lượng natri cao cho 1 khẩu phần, không phù hợp với người huyết áp cao.",
  //     });
  //   }
  //
  //   // Sugar: > 25g cho 1 serving là cao (khuyến nghị hàng ngày ~50g)
  //   if (nutrition.sugar > 25) {
  //     warnings.push({
  //       type: "warning",
  //       message: "Hàm lượng đường cao cho 1 khẩu phần, người tiểu đường nên hạn chế.",
  //     });
  //   }
  //
  //   // Protein: > 20g cho 1 serving là giàu protein
  //   if (nutrition.protein > 20) {
  //     warnings.push({
  //       type: "success",
  //       message: "Giàu protein cho 1 khẩu phần, tốt cho việc tăng cơ và phục hồi.",
  //     });
  //   }
  //
  //   // Fiber: > 5g cho 1 serving là giàu chất xơ
  //   if (nutrition.fiber > 5) {
  //     warnings.push({
  //       type: "success",
  //       message: "Giàu chất xơ cho 1 khẩu phần, tốt cho hệ tiêu hóa.",
  //     });
  //   }
  //
  //   return warnings;
  // };

  const handleCalculate = async () => {
    // Kiểm tra điều kiện trước khi phân tích
    if (!(dishName || foodName)) {
      showError("Vui lòng nhập tên món ăn");
      return;
    }

    if (!instructions || instructions.length === 0 || instructions.every((step) => !step.trim())) {
      showError("Vui lòng nhập công thức nấu ăn");
      return;
    }

    setIsClick(true);
    let totalNutrition = {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    };

    try {
      let ingredientsArr;
      let currentServings = servings || 1; // Biến để lưu servings đúng, dùng cho tính toán

      if (!db) {
        //load nguyen lieu
        setIsLoadingIngredients(true);

        // Gửi servings vào API để AI tính amount phù hợp
        // Khi người dùng tự nhập, dùng servings đã chọn (không cập nhật từ AI response)
        const nutri = await getIngredientsInAi(instructions, servings);
        ingredientsArr = nutri.ingredients || [];

        // Khi tự nhập (không có foodName), giữ nguyên servings đã chọn
        // Chỉ cập nhật nếu AI trả về servings và người dùng chưa chọn (servings = 1 mặc định)
        // Hoặc nếu không có foodName, luôn dùng servings đã chọn
        if (!foodName) {
          // Người dùng tự nhập: dùng servings đã chọn, không cập nhật từ AI
          currentServings = servings || 1;
        } else {
          // Có foodName: cập nhật servings từ AI nếu có
          if (nutri.servings && nutri.servings > 0) {
            currentServings = nutri.servings;
            setServings(nutri.servings);
          }
        }
        console.log(
          `📊 Servings hiện tại: ${currentServings} (tự nhập: ${!foodName ? "có" : "không"})`
        );

        // Kiểm tra nếu không có nguyên liệu
        if (!ingredientsArr || ingredientsArr.length === 0) {
          setIsLoadingIngredients(false);
          setIsLoadingNutrition(false);
          setIngredients([]);
          setTotalNutrition({});
          setHealthWarnings([]);
          setIsSuccess(true); // Vẫn hiển thị box để show message
          return;
        }

        setIngredients(ingredientsArr);

        setIsLoadingIngredients(false);
        setIsSuccess(true);
      } else {
        // Nếu có trong DB, kiểm tra ingredients
        if (!ingredients || ingredients.length === 0) {
          setIsLoadingIngredients(false);
          setIsLoadingNutrition(false);
          setIngredients([]);
          setTotalNutrition({});
          setHealthWarnings([]);
          setIsSuccess(true); // Vẫn hiển thị box để show message
          return;
        }
        ingredientsArr = ingredients;
        setIsSuccess(true);
      }
      if (!db) {
        // Kiểm tra lại ingredients trước khi lấy dinh dưỡng
        if (!ingredientsArr || ingredientsArr.length === 0) {
          setIsLoadingNutrition(false);
          setTotalNutrition({});
          setHealthWarnings([]);
          return;
        }

        // ------------------------------------------
        // 2️⃣ Giai đoạn 2: Load dinh dưỡng
        // ------------------------------------------
        setIsLoadingNutrition(true);
        console.log("🔍 Bắt đầu lấy dinh dưỡng cho nguyên liệu...");

        const data = await fetchIngredientsNutrition(ingredientsArr);

        // Kiểm tra kết quả từ mapping model
        if (!data || !Array.isArray(data) || data.length === 0) {
          setIsLoadingNutrition(false);
          showError("Không thể lấy thông tin dinh dưỡng. Vui lòng thử lại.");
          return;
        }

        console.log("🔍 Kết quả từ mô hình mapping da co.");

        // Lấy nutrition từ DB dựa trên mongo_id từ mapping result (giống admin)
        const nutrition = await Promise.all(
          data.map(async (item) => {
            const firstResult = item.results?.[0];
            if (!firstResult) {
              return {
                input: item.input,
                name_vi: item.input,
                ingredientId: null,
                nutrition: {
                  calories: 0,
                  protein: 0,
                  fat: 0,
                  carbs: 0,
                  fiber: 0,
                  sugar: 0,
                  sodium: 0,
                },
              };
            }

            // Ưu tiên lấy nutrition từ DB nếu có mongo_id
            let dbNutrition = null;
            const mongoId = firstResult.mongo_id || firstResult.id;

            if (mongoId) {
              try {
                const ingredientDoc = await findIngredientById(mongoId);
                if (ingredientDoc && ingredientDoc.nutrition) {
                  dbNutrition = ingredientDoc.nutrition;
                  console.log(`✅ Lấy nutrition từ DB cho ${item.input} (ID: ${mongoId})`);
                }
              } catch (err) {
                console.warn(
                  `⚠️ Không tìm thấy ingredient trong DB (ID: ${mongoId}):`,
                  err.message
                );
              }
            }

            // Sử dụng nutrition từ DB nếu có, nếu không thì dùng từ mapping model
            const finalNutrition = dbNutrition || firstResult.nutrition || {};

            return {
              input: item.input,
              name_vi: firstResult.name_vi,
              ingredientId: mongoId || null,
              nutrition: {
                calories: +(finalNutrition.calories || 0).toFixed(2),
                protein: +(finalNutrition.protein || 0).toFixed(2),
                fat: +(finalNutrition.fat || 0).toFixed(2),
                carbs: +(finalNutrition.carbs || 0).toFixed(2),
                fiber: +(finalNutrition.fiber || 0).toFixed(2),
                sugar: +(finalNutrition.sugar || 0).toFixed(2),
                sodium: +(finalNutrition.sodium || 0).toFixed(2),
              },
            };
          })
        );
        console.log("\n✅ Dinh dưỡng tìm được (từ DB hoặc mapping model):", nutrition);
        setIngredientsNutrition(nutrition); // Lưu nutrition data để dùng cho substitutions
        setIsLoadingNutrition(false);

        console.log(`📊 Bắt đầu tính toán dinh dưỡng cho ${ingredientsArr.length} nguyên liệu...`);
        ingredientsArr.forEach((ing, i) => {
          // Kiểm tra nếu không có nutrition data cho nguyên liệu này
          if (!nutrition[i] || !nutrition[i].nutrition) {
            console.warn(`⚠️ Không có dinh dưỡng cho nguyên liệu: ${ing.name}`);
            return; // Bỏ qua nguyên liệu này
          }

          const nutri = nutrition[i].nutrition;

          // Kiểm tra quantity có hợp lệ không
          if (
            !ing.quantity ||
            typeof ing.quantity.amount !== "number" ||
            ing.quantity.amount <= 0
          ) {
            console.warn(`⚠️ Định lượng không hợp lệ cho nguyên liệu: ${ing.name}`);
            return; // Bỏ qua nguyên liệu này
          }

          const { amount, unit } = ing.quantity;

          // Chuyển đổi tất cả đơn vị sang gram
          let valueInGram = amount;
          const unitLower = unit?.toLowerCase();
          if (unitLower === "kg") valueInGram = amount * 1000;
          else if (unitLower === "mg") valueInGram = amount / 1000;
          else if (unitLower === "l" || unitLower === "ml") {
            valueInGram = unitLower === "l" ? amount * 1000 : amount;
          } else if (unitLower === "muỗng" || unitLower === "tbsp") {
            valueInGram = amount * 15;
          } else if (unitLower === "tsp") {
            valueInGram = amount * 5;
          }

          // Tính hệ số: nutrition trong DB là cho 100g, nên cần nhân với factor
          // Ví dụ: 300g nguyên liệu => factor = 300/100 = 3
          // Calories = calories_per_100g * 3
          const factor = valueInGram / 100;

          const ingCalories = ((nutri.calories || 0) * factor).toFixed(2);
          const ingFat = ((nutri.fat || 0) * factor).toFixed(2);
          const ingProtein = ((nutri.protein || 0) * factor).toFixed(2);

          console.log(
            `  ${ing.name}: ${amount}${unit || "g"} (${valueInGram}g) => ` +
              `Calories: ${ingCalories}, Fat: ${ingFat}g, Protein: ${ingProtein}g`
          );

          totalNutrition.calories += (nutri.calories || 0) * factor;
          totalNutrition.protein += (nutri.protein || 0) * factor;
          totalNutrition.fat += (nutri.fat || 0) * factor;
          totalNutrition.carbs += (nutri.carbs || 0) * factor;
          totalNutrition.fiber += (nutri.fiber || 0) * factor;
          totalNutrition.sugar += (nutri.sugar || 0) * factor;
          totalNutrition.sodium += (nutri.sodium || 0) * factor;
        });

        // Kiểm tra nếu tổng dinh dưỡng bằng 0 (không tính được gì)
        const hasValidNutrition = Object.values(totalNutrition).some((val) => val > 0);
        if (!hasValidNutrition) {
          setIsLoadingNutrition(false);
          setTotalNutrition({});
          setHealthWarnings([]);
          return;
        }
        for (const key in totalNutrition) {
          totalNutrition[key] = Math.round(totalNutrition[key] * 100) / 100;
        }

        // Chia dinh dưỡng cho số khẩu phần để có dinh dưỡng cho 1 khẩu phần
        // Lưu ý: currentServings đã được cập nhật từ API response ở trên
        const nutritionPerServing = { ...totalNutrition };
        const servingsToUse = currentServings || servings || 1;

        console.log(`\n📊 ===== TỔNG KẾT TÍNH TOÁN DINH DƯỠNG =====`);
        console.log(`📊 Servings: ${servingsToUse}`);
        console.log(`📊 Tổng dinh dưỡng TRƯỚC KHI chia servings:`, {
          calories: totalNutrition.calories.toFixed(2),
          protein: totalNutrition.protein.toFixed(2) + "g",
          fat: totalNutrition.fat.toFixed(2) + "g",
          carbs: totalNutrition.carbs.toFixed(2) + "g",
        });

        if (servingsToUse > 1) {
          console.log(`📊 Chia dinh dưỡng cho ${servingsToUse} khẩu phần...`);
        } else {
          console.log(
            `⚠️ Servings = 1, không chia. Nếu kết quả quá cao, có thể AI đã tính amount cho nhiều servings.`
          );
        }

        for (const key in nutritionPerServing) {
          nutritionPerServing[key] =
            Math.round((nutritionPerServing[key] / servingsToUse) * 100) / 100;
        }

        console.log(`📊 Dinh dưỡng SAU KHI chia servings (cho 1 khẩu phần):`, {
          calories: nutritionPerServing.calories.toFixed(2),
          protein: nutritionPerServing.protein.toFixed(2) + "g",
          fat: nutritionPerServing.fat.toFixed(2) + "g",
          carbs: nutritionPerServing.carbs.toFixed(2) + "g",
        });
        console.log(`📊 ===========================================\n`);
        setTotalNutrition(nutritionPerServing); // Lưu dinh dưỡng cho 1 khẩu phần
      }

      // Không dùng analyzeHealthWarnings nữa vì đã có generateRecipeWarnings
      // generateRecipeWarnings đã xử lý đúng logic: chỉ cảnh báo nếu vượt quá lượng nạp trong ngày
      setHealthWarnings([]);

      // Scroll xuống kết quả
      setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 300);

      showSuccess("Phân tích dinh dưỡng thành công!");

      // Fetch user info and today menu for warnings
      await fetchUserInfoAndTodayMenu();
    } catch (error) {
      console.error("❌ handleCalculate error:", error);

      // Reset states khi có lỗi
      setIsLoadingIngredients(false);
      setIsLoadingNutrition(false);
      setIngredients([]);
      setTotalNutrition({});
      setHealthWarnings([]);

      // Xử lý các loại lỗi khác nhau
      let errorMessage = "Phân tích dinh dưỡng thất bại. Vui lòng thử lại.";

      if (error.response) {
        // Lỗi từ API response
        const status = error.response.status;
        if (status === 400) {
          errorMessage = "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại công thức.";
        } else if (status === 404) {
          errorMessage = "Không tìm thấy dịch vụ. Vui lòng thử lại sau.";
        } else if (status >= 500) {
          errorMessage = "Lỗi máy chủ. Vui lòng thử lại sau.";
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.";
      }

      showError(errorMessage);
    } finally {
      setIsLoadingIngredients(false);
      setIsLoadingNutrition(false);
    }
  };

  const skeletonWidths = [90, 80, 65, 70];

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3} sx={{ minHeight: "calc(100vh - 64px)" }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card sx={{ p: 3, borderRadius: 3, boxShadow: 3 }}>
              <TextField
                fullWidth
                label="Tên món ăn"
                variant="outlined"
                value={foodName || dishName}
                onChange={(e) => setDishName(e.target.value)}
                sx={{ mb: 0 }}
              />
            </Card>
          </Grid>
          {/* Hàng 1: Các bước nấu ăn */}
          {isLoading ? (
            <Grid item xs={12}>
              <Card sx={{ p: 3, borderRadius: 3, boxShadow: 3 }}>
                <Stack spacing={2}>
                  <Skeleton variant="text" width="40%" height={32} />
                  <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
                  <Stack direction="row" spacing={2}>
                    <Skeleton
                      variant="rectangular"
                      width={150}
                      height={36}
                      sx={{ borderRadius: 2 }}
                    />
                    <Skeleton
                      variant="rectangular"
                      width={150}
                      height={36}
                      sx={{ borderRadius: 2 }}
                    />
                  </Stack>
                </Stack>
              </Card>
            </Grid>
          ) : (
            <Grid item xs={12}>
              <Card sx={{ p: 3, borderRadius: 3, boxShadow: 3 }}>
                <MDBox display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                  <MDTypography variant="h6" fontWeight="medium">
                    Công thức nấu
                  </MDTypography>
                  {servings > 0 && (
                    <Chip
                      label={`${servings} khẩu phần`}
                      color="info"
                      sx={{ fontSize: "0.875rem", fontWeight: 500 }}
                    />
                  )}
                </MDBox>

                {/* Chọn số khẩu phần - chỉ hiển thị khi người dùng tự nhập (không có foodName) */}
                {!foodName && (
                  <MDBox mb={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="servings-select-label">Số khẩu phần</InputLabel>
                      <Select
                        labelId="servings-select-label"
                        id="servings-select"
                        value={servings}
                        label="Số khẩu phần"
                        onChange={(e) => setServings(Number(e.target.value))}
                        sx={{
                          minHeight: "48px",
                          "& .MuiSelect-select": {
                            minHeight: "20px",
                            lineHeight: "1.5",
                          },
                        }}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <MenuItem key={num} value={num}>
                            {num} {num === 1 ? "khẩu phần" : "khẩu phần"}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </MDBox>
                )}

                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  value={instructions.length > 0 ? instructions.join("\n") : ""}
                  onChange={(e) => {
                    const steps = e.target.value.split("\n");
                    setInstructions(steps);
                  }}
                  label="Nhập các bước nấu ăn"
                  placeholder="Vui lòng nêu rõ định lượng các nguyên liệu để kết quả phân tích được chính xác nhất!"
                  sx={{ mb: 3, label: { pb: 0.2 } }}
                />

                <MDBox display="flex" gap={2}>
                  <Tooltip
                    title={
                      !(dishName || foodName)
                        ? "Vui lòng nhập tên món ăn"
                        : !instructions ||
                          instructions.length === 0 ||
                          instructions.every((step) => !step.trim())
                        ? "Vui lòng nhập công thức nấu ăn"
                        : ""
                    }
                    arrow
                  >
                    <span>
                      <MDButton
                        variant="contained"
                        color="info"
                        onClick={handleCalculate}
                        disabled={
                          isLoading ||
                          !(dishName || foodName) ||
                          !instructions ||
                          instructions.length === 0 ||
                          instructions.every((step) => !step.trim())
                        }
                      >
                        Phân tích dinh dưỡng
                      </MDButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={
                      !(dishName || foodName)
                        ? "Vui lòng nhập tên món ăn"
                        : !instructions ||
                          instructions.length === 0 ||
                          instructions.every((step) => !step.trim())
                        ? "Vui lòng nhập công thức nấu ăn"
                        : !ingredients || ingredients.length === 0
                        ? 'Vui lòng chọn "Phân tích dinh dưỡng" trước khi muốn lưu món ăn'
                        : !totalNutrition || Object.keys(totalNutrition).length === 0
                        ? "Vui lòng phân tích dinh dưỡng trước"
                        : !Object.values(totalNutrition || {}).some((val) => val > 0)
                        ? "Dinh dưỡng không hợp lệ"
                        : ""
                    }
                    arrow
                  >
                    <span>
                      {/* <MDButton
                        variant="outlined"
                        color="success"
                        onClick={handleSave}
                        disabled={
                          isLoading ||
                          !(dishName || foodName) ||
                          !instructions ||
                          instructions.length === 0 ||
                          instructions.every((step) => !step.trim()) ||
                          !ingredients ||
                          ingredients.length === 0 ||
                          !totalNutrition ||
                          Object.keys(totalNutrition).length === 0 ||
                          !Object.values(totalNutrition).some((val) => val > 0)
                        }
                      >
                        Lưu vào thực đơn
                      </MDButton> */}
                    </span>
                  </Tooltip>
                </MDBox>
              </Card>
            </Grid>
          )}
        </Grid>

        <Grid container spacing={3} sx={{ mt: 0.1 }}>
          {isClick && (
            <Grid item xs={12} md={4} ref={resultRef}>
              <Card sx={{ p: 3, borderRadius: 3, boxShadow: 3, maxHeight: 975, overflowY: "auto" }}>
                <MDTypography variant="h6" fontWeight="medium" gutterBottom>
                  Nguyên liệu
                </MDTypography>

                {/* Phần nội dung có điều kiện */}
                {isLoadingIngredients ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2 }}>
                    {skeletonWidths.map((w, i) => (
                      <Skeleton
                        key={i}
                        variant="rounded"
                        height={22}
                        width={`${w}%`}
                        animation="wave"
                        sx={{ my: 0.5, borderRadius: 1 }}
                      />
                    ))}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      marginTop: 1,
                      maxHeight: 930,
                      overflowY: ingredients && ingredients.length > 0 ? "auto" : "hidden",
                      overflowX: "hidden",
                      borderRadius: 2,
                      scrollbarWidth: "thin",
                      "&::-webkit-scrollbar": {
                        width: 6,
                      },
                      "&::-webkit-scrollbar-thumb": {
                        borderRadius: 3,
                        backgroundColor: "rgba(0,0,0,0.2)",
                      },
                    }}
                  >
                    {ingredients && ingredients.length > 0 ? (
                      ingredients.map((item, index) => (
                        <Box key={index} sx={{ width: "fit-content" }}>
                          <Chip
                            label={`${item.name}${
                              item.quantity?.amount
                                ? ` — ${item.quantity.amount} ${item.quantity.unit}`
                                : ""
                            }`}
                            color="info"
                            variant="outlined"
                            sx={{
                              fontSize: 13,
                              justifyContent: "flex-start",
                              height: "auto",
                              py: 1,
                              width: "auto",
                            }}
                          />
                        </Box>
                      ))
                    ) : (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 170,
                        }}
                      >
                        <MDTypography variant="body2" color="text" sx={{ textAlign: "center" }}>
                          Không phân tích được nguyên liệu nào
                        </MDTypography>
                      </Box>
                    )}
                  </Box>
                )}
              </Card>
            </Grid>
          )}

          {/* Cột phải - Dinh dưỡng */}
          {isSuccess && (
            <Grid item xs={12} md={8}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Card
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    boxShadow: 3,
                    minHeight: 244,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                    <MDBox mb={3} sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <MDBox
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        mb={1}
                        flexWrap="wrap"
                        gap={1}
                      >
                        <MDTypography variant="h6">Thông tin dinh dưỡng</MDTypography>
                        {servings > 0 && (
                          <Chip
                            label={
                              servings === 1
                                ? "Cho 1 khẩu phần"
                                : `Cho 1 khẩu phần (tổng: ${servings} khẩu phần)`
                            }
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ fontSize: "0.75rem" }}
                          />
                        )}
                      </MDBox>
                      <Divider sx={{ mb: 1 }} />

                      {isLoadingNutrition ? (
                        <Grid container spacing={1}>
                          {[...Array(8)].map((_, i) => (
                            <Grid item xs={6} sm={4} md={3} key={i}>
                              <Skeleton variant="text" sx={{ fontSize: "1rem" }} />
                              <Skeleton variant="text" sx={{ fontSize: "1rem" }} />

                              {/* <Skeleton variant="circular" width={40} height={40} />
                              <Skeleton variant="rectangular" width={210} height={60} />
                              <Skeleton variant="rounded" width={210} height={60} /> */}
                            </Grid>
                          ))}
                        </Grid>
                      ) : (
                        <Box
                          sx={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 100,
                          }}
                        >
                          <Grid container spacing={1}>
                            {ingredients &&
                            ingredients.length > 0 &&
                            totalNutrition &&
                            Object.keys(totalNutrition).length > 0 ? (
                              <>
                                {Object.entries(totalNutrition).map(([key, value]) => (
                                  <Grid item xs={6} sm={4} md={3} key={key}>
                                    <MDTypography variant="button" color="text">
                                      {key.charAt(0).toUpperCase() + key.slice(1)}:{" "}
                                      {value.toFixed(1)}
                                      {key === "calories" && " kcal"}
                                      {key !== "calories" &&
                                        key !== "sodium" &&
                                        key !== "sugar" &&
                                        " g"}
                                      {key === "sodium" && " mg"}
                                      {key === "sugar" && " mg"}
                                    </MDTypography>
                                  </Grid>
                                ))}
                                {servings > 1 && (
                                  <Grid item xs={12}>
                                    <MDTypography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ fontStyle: "italic", display: "block", mt: 1 }}
                                    >
                                      * Dinh dưỡng trên là cho 1 khẩu phần. Tổng dinh dưỡng cho{" "}
                                      {servings} khẩu phần:
                                      {Object.entries(totalNutrition)
                                        .map(([key, value]) => {
                                          const total = (value * servings).toFixed(1);
                                          return ` ${key}: ${total}${
                                            key === "calories"
                                              ? " kcal"
                                              : key === "sodium" || key === "sugar"
                                              ? " mg"
                                              : " g"
                                          }`;
                                        })
                                        .join(",")}
                                    </MDTypography>
                                  </Grid>
                                )}
                              </>
                            ) : (
                              <Grid item xs={12}>
                                <MDTypography
                                  variant="body2"
                                  color="text"
                                  sx={{ textAlign: "center", py: 2 }}
                                >
                                  Chưa có nguyên liệu
                                </MDTypography>
                              </Grid>
                            )}
                          </Grid>
                        </Box>
                      )}
                    </MDBox>
                  </Box>
                </Card>

                {/* Cảnh báo & Lưu ý - Chỉ hiển thị khi có warnings */}
                {!isLoadingNutrition && allWarnings.length > 0 ? (
                  <Card sx={{ p: 3, borderRadius: 3, boxShadow: 3 }}>
                    <MDTypography variant="h6" fontWeight="medium" mb={2}>
                      Cảnh báo & Lưu ý
                    </MDTypography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      {allWarnings.map((warning, index) => (
                        <Alert key={index} severity={warning.type}>
                          {warning.message}
                        </Alert>
                      ))}

                      {/* Gợi ý nguyên liệu thay thế */}
                      {isLoadingSubstitutions ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
                          <CircularProgress size={16} />
                          <MDTypography variant="body2" color="text">
                            Đang tải gợi ý nguyên liệu thay thế...
                          </MDTypography>
                        </Box>
                      ) : substitutions && substitutions.length > 0 ? (
                        <Box>
                          <MDTypography variant="h6" fontWeight="medium" mb={2}>
                            Gợi ý nguyên liệu thay thế:
                          </MDTypography>
                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                            {substitutions.map((sub, index) => (
                              <Box key={index} sx={{ pl: 1 }}>
                                <MDTypography variant="body2" fontWeight="medium" mb={0.5}>
                                  {sub.original}:
                                </MDTypography>
                                {sub.reason && (
                                  <MDTypography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block", mb: 0.5, pl: 1, fontStyle: "italic" }}
                                  >
                                    {sub.reason}
                                  </MDTypography>
                                )}
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 0.5,
                                  }}
                                >
                                  {/* Suggestions có trong DB (màu xanh) */}
                                  {sub.suggestionsWithMapping &&
                                    sub.suggestionsWithMapping.length > 0 &&
                                    sub.suggestionsWithMapping.map((suggestionMapping, idx) => (
                                      <Chip
                                        key={idx}
                                        label={
                                          suggestionMapping.note
                                            ? `${suggestionMapping.name} ${suggestionMapping.note}`
                                            : suggestionMapping.name
                                        }
                                        size="small"
                                        color="success"
                                        variant="outlined"
                                        sx={{ fontSize: "0.75rem" }}
                                      />
                                    ))}

                                  {/* Suggestions không có trong DB (màu xám) */}
                                  {sub.suggestionsWithoutMapping &&
                                    sub.suggestionsWithoutMapping.length > 0 &&
                                    sub.suggestionsWithoutMapping.map((suggestion, idx) => (
                                      <Chip
                                        key={idx}
                                        label={suggestion}
                                        size="small"
                                        color="default"
                                        variant="outlined"
                                        sx={{ fontSize: "0.75rem", opacity: 0.7 }}
                                      />
                                    ))}

                                  {/* Không có gợi ý nào */}
                                  {(!sub.suggestionsWithMapping ||
                                    sub.suggestionsWithMapping.length === 0) &&
                                    (!sub.suggestionsWithoutMapping ||
                                      sub.suggestionsWithoutMapping.length === 0) && (
                                      <MDTypography variant="caption" color="text.secondary">
                                        Không có gợi ý thay thế phù hợp
                                      </MDTypography>
                                    )}
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      ) : null}
                    </Box>
                  </Card>
                ) : null}
              </Box>
            </Grid>
          )}
        </Grid>
      </MDBox>
    </DashboardLayout>
  );
}

export default AnalyzeRecipe;
