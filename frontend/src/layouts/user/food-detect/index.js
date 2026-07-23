import React, { useState } from "react";
import {
  Grid,
  Button,
  Input,
  Card,
  CardMedia,
  CircularProgress,
  Divider,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { Box, width } from "@mui/system";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import { detectFood } from "../../../services/recipeApi";

function DetectFood() {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [recipe, setRecipe] = useState("");
  const [nutrition, setNutrition] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null); // Trạng thái lỗi
  // Trạng thái kết quả, khớp với cấu trúc JSON của Backend
  const [analysisData, setAnalysisData] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null); // Lưu file gốc

  const handleImageUpload = (event) => {
    // ⚠️ BẢO VỆ: Ngăn gọi API khi đang xử lý
    if (loading) {
      console.warn("⚠️ Đang xử lý ảnh, bỏ qua request mới");
      return;
    }

    const file = event.target.files[0];

    // Kiểm tra file có tồn tại
    if (!file) {
      return;
    }

    // Kiểm tra MIME type thật
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn đúng định dạng ảnh!");
      // Reset input để có thể chọn lại
      event.target.value = "";
      return;
    }

    // (Tùy chọn) Kiểm tra kích thước tệp
    if (file.size > 5 * 1024 * 1024) {
      // > 5MB
      alert("Ảnh quá lớn, vui lòng chọn ảnh dưới 5MB!");
      // Reset input để có thể chọn lại
      event.target.value = "";
      return;
    }

    // 1. Thiết lập trạng thái ban đầu
    setFileToUpload(file);
    setSelectedImage(URL.createObjectURL(file));
    setAnalysisData([]); // Clear previous data
    setError(null); // Clear previous error
    setLoading(true);

    // 2. GỌI HÀM API THỰC TẾ
    uploadAndAnalyze(file);

    // Reset input để có thể chọn lại file giống nhau nếu cần
    event.target.value = "";
  };

  const uploadAndAnalyze = async (file) => {
    try {
      const result = await detectFood(file);
      // Kiểm tra xem result có phải là JSON hợp lệ và có đủ trường không
      if (result) {
        setAnalysisData(result);
        setError(null); // Clear error if success
      } else {
        // Xử lý trường hợp Gemini trả về JSON không đúng format
        throw new Error("Dữ liệu phân tích không đúng cấu trúc.");
      }
    } catch (err) {
      // Xử lý các loại lỗi khác nhau
      let errorMessage = "Lỗi không xác định khi phân tích ảnh món ăn.";

      // Kiểm tra status code từ error object hoặc message
      const status = err.status;
      const message = err.message || "";

      if (status === 429 || message.includes("429") || message.includes("Lỗi HTTP: 429")) {
        errorMessage = "Quá nhiều yêu cầu. Vui lòng thử lại sau vài phút.";
      } else if (status === 400 || message.includes("400") || message.includes("Lỗi HTTP: 400")) {
        console.log(status, message);
        errorMessage = "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại ảnh.";
      } else if (status >= 500 || message.includes("500") || message.includes("Lỗi HTTP: 5")) {
        errorMessage = "Lỗi máy chủ. Vui lòng thử lại sau.";
      } else if (message) {
        errorMessage = message;
      }

      setError(errorMessage);
      setAnalysisData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToRecipe = () => {
    // Nếu có error, vẫn cho phép chuyển với dữ liệu mặc định
    const dishName = error ? "Lỗi API/Không xác định" : analysisData[0] || "Lỗi API/Không xác định";
    navigate(`/analyze-recipe?dish=${encodeURIComponent(dishName)}`);
  };
  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3} sx={{ minHeight: "calc(100vh - 64px)" }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card sx={{ p: 3 }}>
              {/* --- Khu vực chọn ảnh --- */}
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h5" mb={1}>
                  Ảnh món ăn:
                </Typography>
              </Box>

              <label htmlFor="upload-photo">
                <Input
                  id="upload-photo"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={loading}
                  sx={{ display: "none" }}
                />
                <Box
                  sx={{
                    height: 400,
                    width: "fit-content",
                    minWidth: "40%",
                    border: "1px dashed #ccc",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#fafafa",
                    margin: "0 auto",
                    mb: 4,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1,
                    transition: "all 0.2s ease-in-out",
                    "&:hover": {
                      backgroundColor: loading ? "#fafafa" : "#f0f0f0",
                    },
                    pb: 2,
                    pointerEvents: loading ? "none" : "auto",
                  }}
                >
                  {selectedImage ? (
                    <CardMedia
                      component="img"
                      image={selectedImage}
                      alt="Uploaded food"
                      sx={{
                        height: "100%",
                        objectFit: "cover",
                        borderRadius: 2,
                      }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      + Click vào đây để chọn ảnh
                    </Typography>
                  )}
                </Box>
              </label>

              {/* --- Hiển thị kết quả AI hoặc trạng thái --- */}
              {loading ? (
                <Box textAlign="center">
                  <CircularProgress color="info" />
                  <Typography variant="body2" mt={1}>
                    Đang xử lý ảnh...
                  </Typography>
                </Box>
              ) : (
                <>
                  {selectedImage && (
                    <>
                      {analysisData.length > 0 && (
                        <Grid container spacing={1} alignItems="center" mb={5}>
                          <Grid item xs={6} md={3} lg={2}>
                            <MDTypography variant="h6" fontWeight="medium">
                              Kết quả nhận diện:
                            </MDTypography>
                          </Grid>
                          {analysisData.map((item, index) => (
                            <Grid item xs={6} md={3} lg={3} key={index}>
                              <Typography variant="body2">{item}</Typography>
                            </Grid>
                          ))}
                        </Grid>
                      )}
                      {error && (
                        <Grid container spacing={1} alignItems="center" mb={2}>
                          <Grid item xs={12}>
                            <Typography variant="body2" color="error">
                              {error}
                            </Typography>
                          </Grid>
                        </Grid>
                      )}

                      {analysisData.length === 0 && !error && (
                        <Grid container spacing={1} alignItems="center" mb={5}>
                          <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary">
                              Không có món ăn nào được nhận diện. Bạn có thể thử lại với ảnh khác.
                            </Typography>
                          </Grid>
                        </Grid>
                      )}

                      <Grid item xs={12}>
                        <MDBox display="flex" gap={2} flexWrap="wrap">
                          <MDButton variant="contained" color="info" onClick={handleMoveToRecipe}>
                            Xem chi tiết
                          </MDButton>
                          <label htmlFor="upload-photo-alt">
                            <Input
                              id="upload-photo-alt"
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              disabled={loading}
                              sx={{ display: "none" }}
                            />
                            <MDButton
                              variant="contained"
                              component="span"
                              color="primary"
                              disabled={loading}
                            >
                              Chọn ảnh khác
                            </MDButton>
                          </label>
                        </MDBox>
                      </Grid>
                    </>
                  )}
                </>
              )}
            </Card>
          </Grid>
        </Grid>
      </MDBox>
    </DashboardLayout>
  );
}
export default DetectFood;
