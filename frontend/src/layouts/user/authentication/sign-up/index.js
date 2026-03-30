import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

// @mui material components
import Card from "@mui/material/Card";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Select from "@mui/material/Select";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Authentication layout components
import CoverLayout from "layouts/user/authentication/components/CoverLayout";

// API
import { signup } from "services/authApi";

// Images
// import bgImage from "assets/images/bg-sign-up-cover.jpeg";
const bgImage = "https://res.cloudinary.com/denhj5ubh/image/upload/v1767413364/bgr_vom478.jpg";

function Cover() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    age: "",
    gender: "",
    height: "",
    weight: "",
    goal: "",
    fitnessLevel: "intermediate",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    if (formData.password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);

    try {
      // Loại bỏ confirmPassword trước khi gửi
      const { confirmPassword, ...signupData } = formData;

      // Chuyển đổi số
      if (signupData.age) signupData.age = parseInt(signupData.age);
      if (signupData.height) signupData.height = parseFloat(signupData.height);
      if (signupData.weight) signupData.weight = parseFloat(signupData.weight);

      // Loại bỏ các field rỗng
      Object.keys(signupData).forEach((key) => {
        if (signupData[key] === "" || signupData[key] === null) {
          delete signupData[key];
        }
      });

      const data = await signup(signupData);

      // Nếu cần verify email, redirect đến trang verify
      if (data.requiresEmailVerification) {
        navigate("/authentication/verify-email", {
          state: { email: formData.email },
        });
      } else {
        // Redirect đến dashboard
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.message || "Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <CoverLayout image={bgImage}>
      <Card
        sx={{
          width: "100%",
          maxWidth: { xs: "100%", sm: "500px", md: "600px" },
          mx: "auto",
        }}
      >
        <MDBox
          variant="gradient"
          bgColor="info"
          borderRadius="lg"
          coloredShadow="success"
          mx={{ xs: 1, sm: 2 }}
          mt={-6}
          p={{ xs: 2, sm: 3 }}
          mb={1}
          textAlign="center"
        >
          <MDTypography variant="h4" fontWeight="medium" color="white" mt={0}>
            Đăng ký
          </MDTypography>
          <MDTypography display="block" variant="button" color="white" my={0}>
            Nhập thông tin để tạo tài khoản mới
          </MDTypography>
        </MDBox>
        <MDBox pt={4} pb={3} px={{ xs: 2, sm: 3, md: 4 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <MDBox component="form" role="form" onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              {/* Tên */}
              <Grid item xs={12}>
                <MDInput
                  type="text"
                  label="Tên"
                  variant="outlined"
                  fullWidth
                  value={formData.name}
                  onChange={handleChange("name")}
                  required
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>

              {/* Email */}
              <Grid item xs={12}>
                <MDInput
                  type="email"
                  label="Email"
                  variant="outlined"
                  fullWidth
                  value={formData.email}
                  onChange={handleChange("email")}
                  required
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>

              {/* Mật khẩu và Xác nhận mật khẩu */}
              <Grid item xs={12} sm={6}>
                <MDInput
                  type="password"
                  label="Mật khẩu"
                  variant="outlined"
                  fullWidth
                  value={formData.password}
                  onChange={handleChange("password")}
                  required
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <MDInput
                  type="password"
                  label="Xác nhận mật khẩu"
                  variant="outlined"
                  fullWidth
                  value={formData.confirmPassword}
                  onChange={handleChange("confirmPassword")}
                  required
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>

              {/* Tuổi và Giới tính */}
              <Grid item xs={12} sm={6}>
                <MDInput
                  type="number"
                  label="Tuổi"
                  variant="outlined"
                  fullWidth
                  value={formData.age}
                  onChange={handleChange("age")}
                  inputProps={{ min: 0, max: 150 }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="gender-label" sx={{ lineHeight: "1.5" }}>
                    Giới tính
                  </InputLabel>
                  <Select
                    labelId="gender-label"
                    label="Giới tính"
                    value={formData.gender}
                    onChange={handleChange("gender")}
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
                    <MenuItem value="male">Nam</MenuItem>
                    <MenuItem value="female">Nữ</MenuItem>
                    <MenuItem value="other">Khác</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Chiều cao và Cân nặng */}
              <Grid item xs={12} sm={6}>
                <MDInput
                  type="number"
                  label="Chiều cao (cm)"
                  variant="outlined"
                  fullWidth
                  value={formData.height}
                  onChange={handleChange("height")}
                  inputProps={{ min: 0, step: "any" }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <MDInput
                  type="number"
                  label="Cân nặng (kg)"
                  variant="outlined"
                  fullWidth
                  value={formData.weight}
                  onChange={handleChange("weight")}
                  inputProps={{ min: 0, step: "any" }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "48px",
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "14px 14px",
                      lineHeight: "1.5",
                    },
                    "& .MuiInputLabel-root": {
                      lineHeight: "1.5",
                    },
                  }}
                />
              </Grid>

              {/* Mục tiêu */}
              <Grid item xs={12}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="goal-label" sx={{ lineHeight: "1.5" }}>
                    Mục tiêu
                  </InputLabel>
                  <Select
                    labelId="goal-label"
                    label="Mục tiêu"
                    value={formData.goal}
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
              </Grid>

              {/* Mức độ fitness */}
              <Grid item xs={12}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="fitness-level-label" sx={{ lineHeight: "1.5" }}>
                    Mức độ fitness
                  </InputLabel>
                  <Select
                    labelId="fitness-level-label"
                    label="Mức độ fitness"
                    value={formData.fitnessLevel}
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
              </Grid>
            </Grid>
            <MDBox mt={4} mb={1}>
              <MDButton variant="gradient" color="info" fullWidth type="submit" disabled={loading}>
                {loading ? "Đang đăng ký..." : "Đăng ký"}
              </MDButton>
            </MDBox>
            <MDBox mt={3} mb={1} textAlign="center">
              <MDTypography variant="button" color="text">
                Đã có tài khoản?{" "}
                <MDTypography
                  component={Link}
                  to="/authentication/sign-in"
                  variant="button"
                  color="info"
                  fontWeight="medium"
                  textGradient
                >
                  Đăng nhập
                </MDTypography>
              </MDTypography>
            </MDBox>
          </MDBox>
        </MDBox>
      </Card>
    </CoverLayout>
  );
}

export default Cover;
