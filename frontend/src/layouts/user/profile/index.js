import React, { useState, useEffect, useMemo } from "react";
import {
  Grid,
  Card,
  TextField,
  Avatar,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  CircularProgress,
  Autocomplete,
  Chip,
} from "@mui/material";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import { getUser, getToken, getMe } from "services/authApi";
import { updateUser } from "services/userApi";
import { getFavoriteRecipes } from "services/favoriteApi";
import { getRecipesByDateAndStatus } from "services/dailyMenuApi";
import { getIngredients } from "services/ingredientApi";
import { useToast } from "context/ToastContext";
import { getActiveNutritionGoal } from "services/nutritionGoalApi";
import avatar from "assets/theme/components/avatar";

function Profile() {
  const { showSuccess, showError } = useToast();

  const token = getToken();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goalLoading, setGoalLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [nutritionGoal, setNutritionGoal] = useState(null);

  const [ingredients, setIngredients] = useState([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);

  const [avatar, setAvatar] = useState(null);
  
  const [profile, setProfile] = useState({
    name: "",
    age: "",
    gender: "male",
    height: "",
    weight: "",
    goal: "maintain_weight",
    fitnessLevel: "intermediate",
    allergies: [],
  });
  const [originalProfile, setOriginalProfile] = useState({ ...profile });
  const mapGoalToBackend = (goal) => {
    if (
      goal === "lose_weight" ||
      goal === "gain_weight" ||
      goal === "maintain_weight" ||
      goal === ""
    ) {
      return goal;
    }
    const goalMap = {
      giam_can: "lose_weight",
      tang_co: "gain_weight",
      maintain: "maintain_weight",
      can_bang: "maintain_weight",
    };
    return goalMap[goal] || goal;
  };
  const mapGoalToFrontend = (goal) => {
    if (
      goal === "lose_weight" ||
      goal === "gain_weight" ||
      goal === "maintain_weight" ||
      goal === ""
    ) {
      return goal;
    }
    const goalMap = {
      lose_weight: "lose_weight",
      gain_weight: "gain_weight",
      maintain_weight: "maintain_weight",
    };
    return goalMap[goal] || goal || "";
  };
  const goalLabels = { lose_weight: "Giảm cân", gain_weight: "Tăng cân", maintain_weight: "Duy trì cân nặng", "": "Không chọn", 
    giam_can: "Giảm cân", tang_co: "Tăng cơ", maintain: "Duy trì", can_bang: "Cân bằng", an_chay: "Ăn chay", };
  // ================================
  // AUTH CHECK
  // ================================
  useEffect(() => {
    if (!token) {
      showError("Vui lòng đăng nhập.");
      setLoading(false);
    }
  }, [token]);

  // ================================
  // LOAD USER FROM /me
  // ================================
  useEffect(() => {
    const loadProfile = async () => {
      try {
        if (!token) return;

        const userData = await getMe();
        const user = userData.user || userData;

        setCurrentUser(user);

        const mappedProfile = {
          name: user.name || "",
          age: user.age?.toString() || "",
          gender: user.gender || "male",
          height: user.height?.toString() || "",
          weight: user.weight?.toString() || "",
          goal: user.goal || "maintain_weight",
          fitnessLevel: user.fitnessLevel || "intermediate",
          allergies: Array.isArray(user.allergies) ? user.allergies : [],
        };

        setProfile(mappedProfile);
        setOriginalProfile(mappedProfile);
      } catch (error) {
        showError("Không thể tải thông tin người dùng.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [token]);

  // ================================
  // LOAD ACTIVE NUTRITION GOAL
  // ================================
  useEffect(() => {
    const loadGoal = async () => {
      try {
        if (!token) return;

        setGoalLoading(true);

        const result = await getActiveNutritionGoal();
        if (result?.targetNutrition) {
          setNutritionGoal(result.targetNutrition);
        } else {
          setNutritionGoal(null);
        }
      } catch (error) {
        setNutritionGoal(null);
      } finally {
        setGoalLoading(false);
      }
    };

    if (currentUser) loadGoal();
  }, [currentUser, token]);

  // ================================
  // LOAD INGREDIENTS (UI giữ nguyên)
  // ================================
  useEffect(() => {
    const loadIngredients = async () => {
      try {
        setIngredientsLoading(true);
        const result = await getIngredients({ limit: 1000 });
        setIngredients(result.data || []);
      } catch (error) {
        console.error(error);
      } finally {
        setIngredientsLoading(false);
      }
    };

    loadIngredients();
  }, []);

  // ================================
  // SAVE PROFILE
  // ================================
  const handleSave = async () => {
    if (!currentUser) return;

    try {
      setSaving(true);

      const updateData = {
        name: profile.name,
        age: profile.age ? parseInt(profile.age) : undefined,
        gender: profile.gender,
        height: profile.height ? parseFloat(profile.height) : undefined,
        weight: profile.weight ? parseFloat(profile.weight) : undefined,
        goal: profile.goal,
        fitnessLevel: profile.fitnessLevel,
        allergies: profile.allergies,
      };

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined || updateData[key] === "") {
          delete updateData[key];
        }
      });

      // IMPORTANT: backend must verify req.user._id === params.id
      await updateUser(currentUser._id, updateData);

      // Reload nutrition goal after update
      const updatedGoal = await getActiveNutritionGoal();
      setNutritionGoal(updatedGoal?.targetNutrition || null);

      setOriginalProfile(profile);
      setIsEditing(false);

      showSuccess("Cập nhật thành công!");
    } catch (error) {
      showError("Không thể lưu thông tin.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setProfile(originalProfile);
    setIsEditing(false);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatar(URL.createObjectURL(file));
    }
  };
  const handleChange = (field) => (e) => {
    setProfile({ ...profile, [field]: e.target.value });
  };

  const defaultNutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    fiber: 0,
    sodium: 0,
    sugar: 0,
  };

  const nutrition = nutritionGoal ?? defaultNutrition;

  const bmi = useMemo(() => {
    const h = parseFloat(profile.height) / 100;
    const w = parseFloat(profile.weight);
    if (h > 0 && w > 0) return (w / (h * h)).toFixed(1);
    return null;
  }, [profile.height, profile.weight]);

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardNavbar />
        <MDBox py={6} display="flex" justifyContent="center">
          <CircularProgress />
        </MDBox>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3} px={2}>
        <Grid container spacing={3}>
          {/* Cột trái: Thông tin cá nhân */}
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 3, height: "100%" }}>
              {/* Avatar */}
              <MDBox
                display="flex"
                flexDirection="column"
                alignItems="center"
                mb={3}
                position="relative"
              >
                <Avatar
                  src={avatar}
                  alt="Avatar"
                  sx={{
                    width: 120,
                    height: 120,
                    border: "3px solid",
                    borderColor: "grey.300",
                    mb: 2,
                  }}
                />
                {isEditing && (
                  <IconButton
                    component="label"
                    sx={{
                      position: "absolute",
                      top: 0,
                      right: "calc(50% - 68px)",
                      backgroundColor: "white",
                      boxShadow: 2,
                      "&:hover": { backgroundColor: "grey.100" },
                    }}
                  >
                    <EditIcon color="primary" fontSize="small" />
                    <input hidden accept="image/*" type="file" onChange={handleAvatarChange} />
                  </IconButton>
                )}
                <MDTypography variant="h5" fontWeight="medium">
                  {profile.name}
                </MDTypography>
              </MDBox>

              <Divider sx={{ my: 2 }} />

              {/* Thông tin cá nhân */}
              {!isEditing ? (
                <>
                  <MDTypography variant="h6" mb={2} fontWeight="medium">
                    Thông tin cá nhân
                  </MDTypography>
                  <MDBox display="flex" flexDirection="column" gap={1.5}>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        Tuổi:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {profile.age} tuổi
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        Giới tính:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {profile.gender === "male"
                          ? "Nam"
                          : profile.gender === "female"
                          ? "Nữ"
                          : "Khác"}
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        Chiều cao:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {profile.height} cm
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        Cân nặng:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {profile.weight} kg
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        BMI:
                      </MDTypography>
                      <MDBox display="flex" alignItems="center" gap={1}>
                        <MDTypography
                          variant="button"
                          // color={bmiCategory.color}
                          fontWeight="medium"
                        >
                          {bmi}
                        </MDTypography>
                        {/* <MDTypography variant="caption" color="text">
                          ({bmiCategory.label})
                        </MDTypography> */}
                      </MDBox>
                    </MDBox>
                  </MDBox>

                  <Divider sx={{ my: 2 }} />

                  <MDBox display="flex" flexDirection="column" gap={1.5}>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        Mục tiêu:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {goalLabels[profile.goal] || profile.goal}
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" justifyContent="space-between">
                      <MDTypography variant="button" color="text" fontWeight="medium">
                        Mức độ fitness:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {profile.fitnessLevel === "sedentary" && "Ít hoạt động"}
                        {profile.fitnessLevel === "beginner" && "Mới bắt đầu"}
                        {profile.fitnessLevel === "intermediate" && "Trung cấp"}
                        {profile.fitnessLevel === "advanced" && "Nâng cao"}
                        {profile.fitnessLevel === "athlete" && "Vận động viên"}
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" flexDirection="column">
                      <MDTypography variant="button" color="text" fontWeight="medium" mb={0.5}>
                        Dị ứng:
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {Array.isArray(profile.allergies) && profile.allergies.length > 0
                          ? profile.allergies.join(", ")
                          : profile.allergy || "Không có"}
                      </MDTypography>
                    </MDBox>
                  </MDBox>

                  <MDButton
                    variant="gradient"
                    color="info"
                    fullWidth
                    startIcon={<EditIcon />}
                    onClick={() => setIsEditing(true)}
                    sx={{ mt: 3 }}
                  >
                    Chỉnh sửa
                  </MDButton>
                </>
              ) : (
                <>
                  <MDTypography variant="h6" mb={2} fontWeight="medium">
                    Thông tin cá nhân
                  </MDTypography>
                  <MDBox display="flex" flexDirection="column" gap={2}>
                    <TextField
                      label="Họ tên"
                      fullWidth
                      value={profile.name}
                      onChange={handleChange("name")}
                      size="small"
                    />
                    <TextField
                      label="Tuổi"
                      fullWidth
                      type="number"
                      value={profile.age}
                      onChange={handleChange("age")}
                      size="small"
                      inputProps={{ min: 1, max: 120 }}
                    />
                    <FormControl fullWidth variant="outlined">
                      <InputLabel>Giới tính</InputLabel>
                      <Select
                        value={profile.gender}
                        onChange={handleChange("gender")}
                        label="Giới tính"
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            minHeight: "56px",
                          },
                          "& .MuiSelect-select": {
                            padding: "14px 14px",
                            lineHeight: "2.9",
                          },
                          fontSize: "13px",
                        }}
                      >
                        <MenuItem value="male">Nam</MenuItem>
                        <MenuItem value="female">Nữ</MenuItem>
                        <MenuItem value="other">Khác</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Chiều cao (cm)"
                      fullWidth
                      type="number"
                      value={profile.height}
                      onChange={handleChange("height")}
                      size="small"
                      inputProps={{ min: 50, max: 250 }}
                    />
                    <TextField
                      label="Cân nặng (kg)"
                      fullWidth
                      type="number"
                      value={profile.weight}
                      onChange={handleChange("weight")}
                      size="small"
                      inputProps={{ min: 1, max: 300 }}
                    />
                    {/* {bmi !== "0" && (
                      <MDBox
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: `${bmiCategory.color}.lighter`,
                          border: `1px solid`,
                          borderColor: `${bmiCategory.color}.main`,
                        }}
                      >
                        <MDTypography variant="caption" color="text" fontWeight="medium">
                          BMI: {bmi} - {bmiCategory.label}
                        </MDTypography>
                      </MDBox>
                    )} */}
                  </MDBox>

                  <Divider sx={{ my: 2 }} />

                  <MDTypography variant="h6" mb={2} fontWeight="medium">
                    Mục tiêu dinh dưỡng
                  </MDTypography>
                  <FormControl fullWidth variant="outlined" sx={{ mb: 2 }}>
                    <InputLabel id="goal-label" sx={{ lineHeight: "1.5" }}>
                      Mục tiêu
                    </InputLabel>
                    <Select
                      labelId="goal-label"
                      label="Mục tiêu"
                      value={profile.goal}
                      onChange={handleChange("goal")}
                      sx={{
                        minHeight: "48px",
                        "& .MuiSelect-select": {
                          display: "flex",
                          alignItems: "center",
                          padding: "14px 14px !important",
                          lineHeight: "1.5",
                          minHeight: "20px",
                        },
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(0, 0, 0, 0.23)",
                          borderWidth: "1px",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(0, 0, 0, 0.87)",
                          borderWidth: "1px",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                          borderColor: "#1976d2",
                          borderWidth: "1px",
                        },
                      }}
                    >
                      <MenuItem value="">Không chọn</MenuItem>
                      <MenuItem value="lose_weight">Giảm cân</MenuItem>
                      <MenuItem value="maintain_weight">Duy trì cân nặng</MenuItem>
                      <MenuItem value="gain_weight">Tăng cân</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth variant="outlined" sx={{ mb: 2 }}>
                    <InputLabel id="fitness-level-label" sx={{ lineHeight: "1.5" }}>
                      Mức độ fitness
                    </InputLabel>
                    <Select
                      labelId="fitness-level-label"
                      label="Mức độ fitness"
                      value={profile.fitnessLevel}
                      onChange={handleChange("fitnessLevel")}
                      sx={{
                        minHeight: "48px",
                        "& .MuiSelect-select": {
                          display: "flex",
                          alignItems: "center",
                          padding: "14px 14px !important",
                          lineHeight: "1.5",
                          minHeight: "20px",
                        },
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(0, 0, 0, 0.23)",
                          borderWidth: "1px",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(0, 0, 0, 0.87)",
                          borderWidth: "1px",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                          borderColor: "#1976d2",
                          borderWidth: "1px",
                        },
                      }}
                    >
                      <MenuItem value="sedentary">Ít hoạt động (ít vận động, chủ yếu ngồi văn phòng)</MenuItem>
                      <MenuItem value="beginner">Mới bắt đầu (tập nhẹ 1-3 ngày/tuần)</MenuItem>
                      <MenuItem value="intermediate">Trung cấp (tập vừa 4-5 ngày/tuần)</MenuItem>
                      <MenuItem value="advanced">Nâng cao (tập cường độ cao 6-7 ngày/tuần)</MenuItem>
                      <MenuItem value="athlete">Vận động viên (tập 2 lần/ngày)</MenuItem>
                    </Select>
                  </FormControl>

                  <Divider sx={{ my: 2 }} />

                  <MDTypography variant="h6" mb={2} fontWeight="medium">
                    Tiền sử dị ứng
                  </MDTypography>
                  <Autocomplete
                    multiple
                    freeSolo
                    limitTags={0}
                    options={ingredients.map((ingredient) => ingredient.name)}
                    value={
                      Array.isArray(profile.allergies) && profile.allergies.length > 0
                        ? profile.allergies
                        : []
                    }
                    onChange={(event, newValue) => {
                      // newValue là array các string (có thể là từ suggestions hoặc tự nhập)
                      const allergiesArray = newValue
                        .map((item) => (typeof item === "string" ? item.trim() : item))
                        .filter(Boolean)
                        .filter((item, index, self) => self.indexOf(item) === index); // Loại bỏ trùng lặp

                      setProfile({
                        ...profile,
                        allergies: allergiesArray,
                        allergy: allergiesArray.join(", "), // Giữ lại để tương thích
                      });
                    }}
                    loading={ingredientsLoading}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Thực phẩm dị ứng"
                        size="small"
                        placeholder="Chọn hoặc nhập tên nguyên liệu dị ứng"
                      />
                    )}
                    renderTags={() => null}
                    filterOptions={(options, params) => {
                      const filtered = options.filter((option) =>
                        option.toLowerCase().includes(params.inputValue.toLowerCase())
                      );

                      // Nếu giá trị nhập không có trong danh sách, thêm vào (freeSolo)
                      if (params.inputValue && !filtered.includes(params.inputValue)) {
                        return [params.inputValue, ...filtered];
                      }

                      return filtered;
                    }}
                  />
                  {/* Hiển thị Chip bên ngoài */}
                  {Array.isArray(profile.allergies) && profile.allergies.length > 0 && (
                    <MDBox
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 1,
                        mt: 1,
                        mb: 2,
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: "grey.50",
                        border: "1px solid",
                        borderColor: "grey.300",
                      }}
                    >
                      {profile.allergies.map((allergy, index) => (
                        <Chip
                          key={index}
                          label={allergy}
                          size="small"
                          variant="outlined"
                          onDelete={() => {
                            const newAllergies = profile.allergies.filter((_, i) => i !== index);
                            setProfile({
                              ...profile,
                              allergies: newAllergies,
                              allergy: newAllergies.join(", "),
                            });
                          }}
                          sx={{
                            "& .MuiChip-deleteIcon": {
                              fontSize: "16px",
                            },
                          }}
                        />
                      ))}
                    </MDBox>
                  )}

                  <MDBox display="flex" gap={1.5}>
                    <MDButton
                      variant="outlined"
                      color="error"
                      fullWidth
                      startIcon={<CancelIcon />}
                      onClick={handleCancel}
                      disabled={saving}
                    >
                      Hủy
                    </MDButton>
                    <MDButton
                      variant="gradient"
                      color="success"
                      fullWidth
                      startIcon={
                        saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />
                      }
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Đang lưu..." : "Lưu"}
                    </MDButton>
                  </MDBox>
                </>
              )}
            </Card>
          </Grid>

          {/* Cột phải: Thông tin bổ sung */}
          <Grid item xs={12} md={8}>
            <Grid container spacing={3}>
              {/* Card: Thông tin dinh dưỡng */}
              <Grid item xs={12}>
                <Card sx={{ p: 3 }}>
                  <MDTypography variant="h6" mb={2} fontWeight="medium">
                    Mục tiêu dinh dưỡng hàng ngày
                  </MDTypography>

                  {goalLoading ? (
                    <MDBox display="flex" justifyContent="center" py={4}>
                      <CircularProgress size={24} />
                    </MDBox>
                  ) : !nutrition ? (
                    <MDBox mt={2}>
                      <MDTypography variant="caption" color="warning.main">
                        ⚠️ Vui lòng cập nhật đầy đủ thông tin để hệ thống tính toán mục tiêu dinh
                        dưỡng.
                      </MDTypography>
                    </MDBox>
                  ) : (
                    <>
                      {/* Calories */}
                      <Grid container spacing={2} mb={2}>
                        <Grid item xs={12}>
                          <MDBox
                            sx={{
                              p: 3,
                              borderRadius: 2,
                              bgcolor: "info.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h3" color="info.main" fontWeight="bold">
                              {nutrition.calories}
                            </MDTypography>
                            <MDTypography variant="body1" color="text" fontWeight="medium">
                              kcal/ngày
                            </MDTypography>
                          </MDBox>
                        </Grid>
                      </Grid>

                      {/* 6 chất còn lại */}
                      <Grid container spacing={2}>
                        {/* Protein */}
                        <Grid item xs={6} sm={4} md={2}>
                          <MDBox
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: "success.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h5" color="success.main" fontWeight="bold">
                              {nutrition.protein}g
                            </MDTypography>
                            <MDTypography variant="caption">Protein</MDTypography>
                          </MDBox>
                        </Grid>

                        {/* Fat */}
                        <Grid item xs={6} sm={4} md={2}>
                          <MDBox
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: "warning.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h5" color="warning.main" fontWeight="bold">
                              {nutrition.fat}g
                            </MDTypography>
                            <MDTypography variant="caption">Fat</MDTypography>
                          </MDBox>
                        </Grid>

                        {/* Carbs */}
                        <Grid item xs={6} sm={4} md={2}>
                          <MDBox
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: "error.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h5" color="error.main" fontWeight="bold">
                              {nutrition.carbs}g
                            </MDTypography>
                            <MDTypography variant="caption">Carbs</MDTypography>
                          </MDBox>
                        </Grid>

                        {/* Fiber */}
                        <Grid item xs={6} sm={4} md={2}>
                          <MDBox
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: "secondary.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h5" color="secondary.main" fontWeight="bold">
                              {nutrition.fiber}g
                            </MDTypography>
                            <MDTypography variant="caption">Fiber</MDTypography>
                          </MDBox>
                        </Grid>

                        {/* Sodium */}
                        <Grid item xs={6} sm={4} md={2}>
                          <MDBox
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: "dark.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h5" color="dark.main" fontWeight="bold">
                              {nutrition.sodium}mg
                            </MDTypography>
                            <MDTypography variant="caption">Sodium</MDTypography>
                          </MDBox>
                        </Grid>

                        {/* Sugar */}
                        <Grid item xs={6} sm={4} md={2}>
                          <MDBox
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: "primary.lighter",
                              textAlign: "center",
                            }}
                          >
                            <MDTypography variant="h5" color="primary.main" fontWeight="bold">
                              {nutrition.sugar}g
                            </MDTypography>
                            <MDTypography variant="caption">Sugar</MDTypography>
                          </MDBox>
                        </Grid>
                      </Grid>
                    </>
                  )}
                </Card>
              </Grid>

              {/* Card: Lịch sử */}
              <Grid item xs={12}>
                {/* <Card sx={{ p: 3 }}>
                  <MDTypography variant="h6" mb={2} fontWeight="medium">
                    Thống kê hoạt động
                  </MDTypography>
                  {statistics.loading ? (
                    <MDBox display="flex" justifyContent="center" alignItems="center" py={4}>
                      <CircularProgress size={24} />
                    </MDBox>
                  ) : (
                    <MDBox display="flex" flexDirection="column" gap={2}>
                      <MDBox display="flex" justifyContent="space-between" alignItems="center">
                        <MDTypography variant="button" color="text">
                          Số ngày sử dụng
                        </MDTypography>
                        <MDTypography variant="h6" color="success.main" fontWeight="bold">
                          {statistics.totalDaysUsed}{" "}
                          {statistics.totalDaysUsed === 1 ? "ngày" : "ngày"}
                        </MDTypography>
                      </MDBox>
                      <Divider />
                      <MDBox display="flex" flexDirection="column" gap={1}>
                        <MDBox display="flex" justifyContent="space-between" alignItems="center">
                          <MDTypography variant="button" color="text">
                            Tổng số món yêu thích
                          </MDTypography>
                          <MDTypography variant="h6" color="error.main" fontWeight="bold">
                            {statistics.totalFavorites}
                          </MDTypography>
                        </MDBox>
                        {statistics.favoriteRecipes.length > 0 && (
                          <MDBox
                            display="flex"
                            flexDirection="column"
                            gap={0.5}
                            sx={{ pl: 1, mt: 0.5 }}
                          >
                            {statistics.favoriteRecipes.map((recipe, index) => (
                              <MDTypography
                                key={recipe._id || index}
                                variant="caption"
                                color="text"
                              >
                                {index + 1}. {recipe.name || recipe.recipeId?.name || "Không tên"}
                              </MDTypography>
                            ))}
                          </MDBox>
                        )}
                      </MDBox>
                    </MDBox>
                  )}
                </Card> */}
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </MDBox>
    </DashboardLayout>
  );
}

export default Profile;
