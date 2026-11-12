// src/layouts/admin/recipes/components/RecipeFormDialog.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Card,
  Chip,
  Tooltip,
  Divider,
  Alert,
  Box,
  Typography,
  IconButton,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ImageIcon from "@mui/icons-material/Image";
import DeleteIcon from "@mui/icons-material/Delete";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

import RecipeIngredientsEditor from "./RecipeIngredientsEditor";

import { getIngredientsInAi } from "services/recipeApi";
import { uploadImage } from "services/uploadApi";
import { useToast } from "context/ToastContext";
import PropTypes from "prop-types";

import { ObjectId } from "bson";

const CATEGORY_OPTIONS = [
  { value: "main", label: "Món chính" },
  { value: "side", label: "Món phụ" },
  { value: "dessert", label: "Tráng miệng" },
  { value: "drink", label: "Đồ uống" },
  { value: "base_starch", label: "Tinh bột cơ bản" },
  { value: "light_supplement", label: "Bổ sung nhẹ" },
  { value: "one_dish_meal", label: "Món ăn một món" },
  { value: "soup_veg", label: "Canh rau" },
];

const STEPS = [
  { key: "basic", label: "Thông tin cơ bản" },
  { key: "text", label: "Công thức (text)" },
  { key: "map", label: "Nguyên liệu & mapping" },
  { key: "review", label: "Kiểm tra & lưu" },
];

const emptyForm = {
  name: "",
  description: "",
  category: "main",
  servings: "",
  imageUrl: "",
  instructionsText: "",
  ingredients: [],
};

function safeUUID() {
  return (
    (typeof crypto !== "undefined" && crypto?.randomUUID?.()) ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function computeValidation(form) {
  const blockers = [];
  const warnings = [];

  if (!form.name?.trim()) blockers.push("Thiếu tên món.");
  // Khẩu phần là optional, có thể null
  // Nếu có giá trị thì phải > 0
  if (form.servings !== undefined && form.servings !== null && form.servings !== "") {
    if (Number(form.servings) <= 0) blockers.push("Khẩu phần phải > 0 nếu có.");
  }

  const rows = Array.isArray(form.ingredients) ? form.ingredients : [];
  if (rows.length === 0) warnings.push("Chưa có nguyên liệu nào.");

  // Publish gate (tuỳ bạn dùng hay không): yêu cầu mapping + lượng để tính nutrition
  const mappedCount = rows.filter((r) => !!r.ingredientId).length;
  const missingQty = rows.filter(
    (r) =>
      r?.quantity?.amount === null ||
      r?.quantity?.amount === null ||
      r?.quantity?.amount === undefined
  ).length;

  if (rows.length > 0 && mappedCount === 0)
    blockers.push("Chưa chọn nguyên liệu DB cho bất kỳ dòng nào.");
  if (missingQty > 0) blockers.push(`Còn ${missingQty} dòng thiếu khối lượng.`);

  return { blockers, warnings, mappedCount, missingQty, totalRows: rows.length };
}

export default function RecipeFormDialog({
  open,
  onClose,
  onSubmit,
  recipe,
  allIngredients,
  onCreateIngredient, // optional: API create ingredient
}) {
  const [form, setForm] = useState(emptyForm);
  const [activeStep, setActiveStep] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    setActiveStep(0);
    setImagePreview(null);
    // TODO: recipe co nen su dung trong check useEffect khong?
    if (recipe) {
      const imageUrl = recipe.imageUrl || recipe.image || "";
      const newForm = {
        name: recipe.name || "",
        description: recipe.description || "",
        category: recipe.category || "main",
        servings: recipe.servings || "",
        imageUrl,
        instructionsText: recipe.instructionsText || "",
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      };

      setForm(newForm);
      if (imageUrl) {
        setImagePreview(imageUrl);
      }
    } else {
      setForm(emptyForm);
    }
  }, [open, recipe]);

  const validation = useMemo(() => computeValidation(form), [form]);
  const publishBlocked = validation.blockers.length > 0;

  const handleChange = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
  };

  const handleIngredientsChange = (ingredients) => {
    setForm((p) => ({ ...p, ingredients }));
  };

  const validateAndUploadFile = async (file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      showError("Chỉ chấp nhận file ảnh: JPG, PNG, WEBP");
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showError("Kích thước ảnh không được vượt quá 5MB");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);

    // Upload to Cloudinary
    try {
      setUploadingImage(true);
      const result = await uploadImage(file, "recipe");
      handleChange("imageUrl", result.url);
      showSuccess("Upload ảnh thành công");
    } catch (error) {
      console.error("Upload error:", error);
      showError(error.message || "Lỗi khi upload ảnh");
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    await validateAndUploadFile(file);
    // Reset input để có thể chọn lại cùng file
    if (e.target) e.target.value = "";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    await validateAndUploadFile(file);
  };

  const handleAnalyzeByAI = async () => {
    const text = (form.instructionsText || form.description || "").trim();
    if (!text) return;

    try {
      setAiLoading(true);
      const aiResult = await getIngredientsInAi(text);
      const aiIngredients = aiResult?.ingredients || [];

      console.log("[Recipe AI] Kết quả extract ingredients:", aiResult);
      console.log(
        "[Recipe AI] Số raw ingredients tạo ra:",
        aiIngredients.length,
        aiIngredients
      );

      const rows = aiIngredients.map((item) => ({
        _id: new ObjectId().toString(),
        source: "ai",
        // Gemini chỉ tạo nguyên liệu thô. Tên chuẩn sẽ được gán sau khi admin
        // chọn kết quả semantic search.
        name: "",
        rawName: item?.rawName || item?.name || "",
        rawText: item?.rawText || item?.rawName || item?.name || "",
        note: item?.note || "",
        quantity: {
          amount: item?.quantity?.amount ?? "",
          unit: item?.quantity?.unit || "g",
          originalAmount: item?.quantity?.originalAmount ?? null,  // ← Lưu giá trị gốc từ AI
          originalUnit: item?.quantity?.originalUnit || null,      // ← Lưu unit gốc từ AI
          estimate: Boolean(item?.quantity?.estimate),
        },

        // mapping fields
        ingredientId: null,
        ingredientLabel: "",
        mappingName: "",
        // mappingCandidates: [],
        // mappingScore: null,

        // flags: { optional: false },
      }));

      setForm((p) => ({ ...p, ingredients: rows }));
      console.log("[Recipe AI] Đã set ingredients vào form và chuyển sang bước 3:", rows);
      setActiveStep(2);
    } catch (err) {
      console.error("AI analyze ingredients error:", err);
    } finally {
      setAiLoading(false);
    }
  };

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  const handleSave = (status) => {
    onSubmit({ ...form, status });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <MDBox>
          <MDTypography variant="h6" fontWeight="medium">
            {recipe ? "Chỉnh sửa món ăn" : "Thêm món ăn mới"}
          </MDTypography>

          <MDBox mt={1.5}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {STEPS.map((s) => (
                <Step key={s.key}>
                  <StepLabel>{s.label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </MDBox>
        </MDBox>
      </DialogTitle>

      <DialogContent dividers sx={{ bgcolor: "background.default" }}>
        {/* STEP 1 */}
        {activeStep === 0 && (
          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <Card sx={{ p: 2.5, borderRadius: 2 }}>
                <MDTypography variant="button" fontWeight="medium">
                  Thông tin cơ bản
                </MDTypography>

                <MDBox mt={2}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={7}>
                      <TextField
                        fullWidth
                        label="Tên món *"
                        value={form.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                      />
                    </Grid>

                    <Grid item xs={12} md={3}>
                      <TextField
                        select
                        fullWidth
                        label="Danh mục"
                        SelectProps={{ native: true }}
                        value={form.category}
                        onChange={(e) => handleChange("category", e.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </TextField>
                    </Grid>

                    <Grid item xs={12} md={2}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Khẩu phần *"
                        value={form.servings}
                        onChange={(e) =>
                          handleChange("servings", e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </Grid>

                    {/* Upload Area */}
                    <Grid item xs={12}>
                      <MDBox>
                        <MDTypography variant="button" fontWeight="medium" mb={1.5}>
                          Ảnh món ăn
                        </MDTypography>

                        {/* Preview ảnh */}
                        {imagePreview && (
                          <MDBox
                            mb={3}
                            sx={{
                              position: "relative",
                              display: "block",
                              width: "100%",
                              maxWidth: 400,
                            }}
                          >
                            <Box
                              component="img"
                              src={imagePreview}
                              alt="Preview"
                              sx={{
                                width: "100%",
                                maxWidth: 400,
                                height: 250,
                                objectFit: "cover",
                                borderRadius: 2,
                                border: "1px solid",
                                borderColor: "grey.300",
                                boxShadow: 2,
                                display: "block",
                              }}
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                            {form.imageUrl && (
                              <Tooltip title="Xóa ảnh">
                                <IconButton
                                  onClick={() => {
                                    handleChange("imageUrl", "");
                                    setImagePreview(null);
                                  }}
                                  sx={{
                                    position: "absolute",
                                    top: 8,
                                    right: 8,
                                    bgcolor: "error.main",
                                    color: "white",
                                    "&:hover": {
                                      bgcolor: "error.dark",
                                    },
                                    boxShadow: 2,
                                  }}
                                  size="small"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </MDBox>
                        )}

                        {/* Upload Dropzone */}
                        <Box
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          sx={{
                            border: "2px dashed",
                            borderColor: isDragging ? "info.main" : "grey.300",
                            borderRadius: 2,
                            p: 3,
                            textAlign: "center",
                            bgcolor: isDragging ? "info.lighter" : "grey.50",
                            cursor: uploadingImage ? "not-allowed" : "pointer",
                            transition: "all 0.3s ease",
                            "&:hover": {
                              borderColor: uploadingImage ? "grey.300" : "info.main",
                              bgcolor: uploadingImage ? "grey.50" : "info.lighter",
                            },
                            opacity: uploadingImage ? 0.6 : 1,
                          }}
                        >
                          <input
                            type="file"
                            id="image-upload-input"
                            hidden
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            onChange={handleImageFileChange}
                            disabled={uploadingImage}
                          />
                          <label
                            htmlFor="image-upload-input"
                            style={{
                              cursor: uploadingImage ? "not-allowed" : "pointer",
                              display: "block",
                            }}
                          >
                            {uploadingImage ? (
                              <MDBox>
                                <Box
                                  sx={{
                                    width: 48,
                                    height: 48,
                                    border: "3px solid",
                                    borderColor: "info.main",
                                    borderTopColor: "transparent",
                                    borderRadius: "50%",
                                    animation: "spin 1s linear infinite",
                                    margin: "0 auto 16px",
                                    "@keyframes spin": {
                                      "0%": { transform: "rotate(0deg)" },
                                      "100%": { transform: "rotate(360deg)" },
                                    },
                                  }}
                                />
                                <Typography variant="body2" color="text">
                                  Đang upload ảnh...
                                </Typography>
                              </MDBox>
                            ) : (
                              <MDBox>
                                <CloudUploadIcon
                                  sx={{
                                    fontSize: 48,
                                    color: "info.main",
                                    mb: 1,
                                  }}
                                />
                                <Typography variant="body1" fontWeight="medium" mb={0.5}>
                                  Kéo thả ảnh vào đây hoặc click để chọn
                                </Typography>
                                <Typography variant="caption" color="text">
                                  Hỗ trợ: JPG, PNG, WEBP (tối đa 5MB)
                                </Typography>
                              </MDBox>
                            )}
                          </label>
                        </Box>
                      </MDBox>
                    </Grid>

                    {/* URL Input - Separate Row */}
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Hoặc nhập URL ảnh"
                        placeholder="https://..."
                        value={form.imageUrl}
                        onChange={(e) => {
                          handleChange("imageUrl", e.target.value);
                          setImagePreview(e.target.value || null);
                        }}
                        disabled={uploadingImage}
                        InputProps={{
                          startAdornment: <ImageIcon sx={{ mr: 1, color: "text.secondary" }} />,
                        }}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        label="Mô tả ngắn"
                        value={form.description}
                        onChange={(e) => handleChange("description", e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* STEP 2 */}
        {activeStep === 1 && (
          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <Card sx={{ p: 2.5, borderRadius: 2 }}>
                <MDBox display="flex" justifyContent="space-between" alignItems="center">
                  <MDTypography variant="button" fontWeight="medium">
                    Công thức / Cách nấu (text)
                  </MDTypography>

                  <Tooltip
                    title={
                      !(form.instructionsText || form.description || "").trim()
                        ? "Nhập công thức hoặc mô tả trước."
                        : "Trích xuất nguyên liệu thô từ text."
                    }
                  >
                    <span>
                      <MDButton
                        variant="outlined"
                        color="info"
                        size="small"
                        onClick={handleAnalyzeByAI}
                        disabled={
                          aiLoading || !(form.instructionsText || form.description || "").trim()
                        }
                      >
                        {aiLoading ? "Đang phân tích..." : "Phân tích nguyên liệu (AI)"}
                      </MDButton>
                    </span>
                  </Tooltip>
                </MDBox>

                <MDBox mt={2}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={12}
                    label="Nhập hướng dẫn nấu / ingredients / notes..."
                    value={form.instructionsText}
                    onChange={(e) => handleChange("instructionsText", e.target.value)}
                  />
                </MDBox>

                <MDBox mt={2}>
                  <MDTypography variant="caption" color="text">
                    Tip: dán phần Ingredients rõ ràng giúp AI parse ổn định hơn.
                  </MDTypography>
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* STEP 3 */}
        {activeStep === 2 && (
          <RecipeIngredientsEditor
            ingredients={form.ingredients}
            onChange={handleIngredientsChange}
            allIngredients={allIngredients}
            onAnalyzeByAI={handleAnalyzeByAI}
            aiLoading={aiLoading}
            aiDisabled={!(form.instructionsText || form.description || "").trim()}
            onCreateIngredient={onCreateIngredient}
          />
        )}

        {/* STEP 4 - REVIEW */}
        {activeStep === 3 && (
          <Grid container spacing={2.5}>
            {/* Thông tin món ăn */}
            <Grid item xs={12}>
              <Card sx={{ p: 2.5, borderRadius: 2 }}>
                <MDTypography variant="h6" fontWeight="medium" mb={2}>
                  Thông tin món ăn
                </MDTypography>

                <Grid container spacing={2}>
                  {/* Ảnh món ăn */}
                  {form.imageUrl && (
                    <Grid item xs={12} md={3}>
                      <Box
                        component="img"
                        src={form.imageUrl}
                        alt={form.name}
                        sx={{
                          width: "100%",
                          height: 150,
                          objectFit: "cover",
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "grey.300",
                        }}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </Grid>
                  )}

                  {/* Thông tin cơ bản */}
                  <Grid item xs={12} md={form.imageUrl ? 9 : 12}>
                    <MDBox display="flex" flexDirection="column" gap={1.5}>
                      <MDBox>
                        <MDTypography variant="caption" color="text" fontWeight="medium">
                          Tên món ăn
                        </MDTypography>
                        <MDTypography variant="body1" fontWeight="medium">
                          {form.name || "(Chưa có tên)"}
                        </MDTypography>
                      </MDBox>

                      <MDBox display="flex" gap={3} alignItems="center" flexWrap="wrap">
                        <MDBox display="flex" alignItems="center" gap={1}>
                          <MDTypography variant="caption" color="text" fontWeight="medium">
                            Danh mục:
                          </MDTypography>
                          <Chip
                            label={
                              CATEGORY_OPTIONS.find((o) => o.value === form.category)?.label ||
                              form.category ||
                              "-"
                            }
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </MDBox>

                        <MDBox display="flex" alignItems="center" gap={1}>
                          <MDTypography variant="caption" color="text" fontWeight="medium">
                            Khẩu phần:
                          </MDTypography>
                          <MDTypography variant="body2" color="text">
                            {form.servings} người
                          </MDTypography>
                        </MDBox>
                      </MDBox>

                      {form.description && (
                        <MDBox>
                          <MDTypography variant="caption" color="text" fontWeight="medium">
                            Mô tả
                          </MDTypography>
                          <MDTypography variant="body2" color="text">
                            {form.description}
                          </MDTypography>
                        </MDBox>
                      )}
                    </MDBox>
                  </Grid>
                </Grid>
              </Card>
            </Grid>

            {/* Validation Status */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <MDTypography variant="h6" fontWeight="medium" mb={2}>
                  Trạng thái kiểm tra
                </MDTypography>

                <MDBox flex={1} display="flex" flexDirection="column" gap={2}>
                  {validation.blockers.length > 0 ? (
                    <Alert severity="error">
                      <MDTypography variant="button" fontWeight="medium" mb={1}>
                        Có lỗi cần sửa:
                      </MDTypography>
                      <MDBox component="ul" sx={{ m: 0, pl: 2 }}>
                        {validation.blockers.map((b, idx) => (
                          <MDTypography key={idx} component="li" variant="caption">
                            {b}
                          </MDTypography>
                        ))}
                      </MDBox>
                    </Alert>
                  ) : (
                    <Alert severity="success">Không có lỗi nào! Bạn có thể xuất bản món ăn.</Alert>
                  )}

                  {validation.warnings.length > 0 && (
                    <Alert severity="warning">
                      <MDTypography variant="button" fontWeight="medium" mb={1}>
                        Cảnh báo ({validation.warnings.length}):
                      </MDTypography>
                      <MDBox component="ul" sx={{ m: 0, pl: 2 }}>
                        {validation.warnings.map((w, idx) => (
                          <MDTypography key={idx} component="li" variant="caption">
                            {w}
                          </MDTypography>
                        ))}
                      </MDBox>
                    </Alert>
                  )}
                </MDBox>
              </Card>
            </Grid>

            {/* Thống kê nguyên liệu */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <MDTypography variant="h6" fontWeight="medium" mb={2}>
                  Thống kê nguyên liệu
                </MDTypography>

                <MDBox
                  flex={1}
                  display="flex"
                  flexDirection="column"
                  gap={1.5}
                  justifyContent="center"
                >
                  <MDBox display="flex" justifyContent="space-between" alignItems="center">
                    <MDTypography variant="body2" color="text">
                      Tổng số nguyên liệu:
                    </MDTypography>
                    <Chip
                      label={validation.totalRows}
                      color={validation.totalRows > 0 ? "info" : "default"}
                      size="small"
                    />
                  </MDBox>

                  <MDBox display="flex" justifyContent="space-between" alignItems="center">
                    <MDTypography variant="body2" color="text">
                      Thiếu khối lượng:
                    </MDTypography>
                    <Chip
                      label={validation.missingQty}
                      color={validation.missingQty === 0 ? "success" : "warning"}
                      size="small"
                    />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            {/* Danh sách nguyên liệu */}
            {form.ingredients && form.ingredients.length > 0 && (
              <Grid item xs={12}>
                <Card sx={{ p: 2.5, borderRadius: 2 }}>
                  <MDTypography variant="h6" fontWeight="medium" mb={2}>
                    Danh sách nguyên liệu ({form.ingredients.length})
                  </MDTypography>

                  <MDBox
                    sx={{
                      border: "1px solid",
                      borderColor: "grey.300",
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    {/* TODO: o day co id va _id */}
                    <Grid container spacing={1}>
                      {form.ingredients.map((ing) => (
                        <Grid
                          item
                          xs={12}
                          sm={6}
                          md={4}
                          key={ing._id}
                        >
                          <MDBox
                            sx={{
                              p: 1,
                              borderRadius: 1,
                              bgcolor: ing.ingredientId ? "success.lighter" : "grey.100",
                              border: "1px solid",
                              borderColor: ing.ingredientId ? "success.main" : "grey.300",
                            }}
                          >
                            <MDTypography variant="caption" fontWeight="medium">
                              {ing.ingredientLabel ||
                                ing.mappingName ||
                                ing.name ||
                                "(Chưa có tên)"}
                            </MDTypography>
                            {ing.quantity?.amount && (
                              <MDTypography variant="caption" color="text" display="block">
                                {ing.quantity.amount} {ing.quantity.unit || "g"}
                              </MDTypography>
                            )}
                          </MDBox>
                        </Grid>
                      ))}
                    </Grid>
                  </MDBox>
                </Card>
              </Grid>
            )}

            {/* Hướng dẫn nấu */}
            {form.instructionsText && (
              <Grid item xs={12}>
                <Card sx={{ p: 2.5, borderRadius: 2 }}>
                  <MDTypography variant="h6" fontWeight="medium" mb={2}>
                    Hướng dẫn nấu
                  </MDTypography>
                  <MDBox
                    sx={{
                      p: 1.5,
                      bgcolor: "grey.50",
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "grey.300",
                    }}
                  >
                    <MDTypography variant="body2" color="text" sx={{ whiteSpace: "pre-wrap" }}>
                      {form.instructionsText}
                    </MDTypography>
                  </MDBox>
                </Card>
              </Grid>
            )}
          </Grid>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <MDButton color="secondary" variant="outlined" onClick={onClose}>
          Hủy
        </MDButton>

        <MDBox flex={1} />

        <MDButton variant="outlined" color="info" onClick={goBack} disabled={activeStep === 0}>
          Quay lại
        </MDButton>

        <MDButton
          variant="contained"
          color="info"
          onClick={goNext}
          disabled={activeStep === STEPS.length - 1}
        >
          Tiếp theo
        </MDButton>

        <MDBox ml={2} display="flex" gap={1}>
          <MDButton variant="outlined" color="info" onClick={() => handleSave("draft")}>
            Lưu nháp
          </MDButton>

          <Tooltip
            title={
              publishBlocked ? validation.blockers.slice(0, 6).join(" • ") : "Có thể xuất bản."
            }
          >
            <span>
              <MDButton
                color="info"
                variant="contained"
                onClick={() => handleSave("published")}
                disabled={publishBlocked}
              >
                Xuất bản
              </MDButton>
            </span>
          </Tooltip>
        </MDBox>
      </DialogActions>
    </Dialog>
  );
}

RecipeFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  recipe: PropTypes.any,
  allIngredients: PropTypes.array.isRequired,
  onCreateIngredient: PropTypes.func, // optional
};

RecipeFormDialog.defaultProps = {
  recipe: null,
  onCreateIngredient: undefined,
};
