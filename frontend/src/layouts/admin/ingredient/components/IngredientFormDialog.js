// src/layouts/admin/ingredients/components/IngredientFormDialog.jsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  MenuItem,
} from "@mui/material";

import MDTypography from "components/MDTypography";
import PropTypes from "prop-types";
import MDButton from "components/MDButton";
import { useToast } from "context/ToastContext";

const CATEGORY_OPTIONS = [
  { value: "protein", label: "Đạm" },
  { value: "carb", label: "Tinh bột" },
  { value: "fat", label: "Chất béo" },
  { value: "vegetable", label: "Rau củ" },
  { value: "fruit", label: "Trái cây" },
  { value: "dairy", label: "Sữa & chế phẩm" },
  { value: "seasoning", label: "Gia vị" },
  { value: "beverage", label: "Thức uống" },
  { value: "other", label: "Khác" },
];

function IngredientFormDialog({ open, onClose, onSubmit, ingredient }) {
  const { showError } = useToast();
  const [form, setForm] = useState({
    name: "",
    name_en: "",
    unit: "100g",
    category: "other",
    calories: "0",
    protein: "0",
    fat: "0",
    carbs: "0",
    fiber: "0",
    sugar: "0",
    sodium: "0",
    source: "other",
  });

  useEffect(() => {
    if (ingredient) {
      const n = ingredient.nutrition || {};
      setForm({
        name: ingredient.name || "",
        name_en: ingredient.name_en || "",
        unit: ingredient.unit || "100g",
        category: ingredient.category || "other",
        calories: n.calories ?? "0",
        protein: n.protein ?? "0",
        fat: n.fat ?? "0",
        carbs: n.carbs ?? "0",
        fiber: n.fiber ?? "0",
        sugar: n.sugar ?? "0",
        sodium: n.sodium ?? "0",
        source: ingredient.external_refs?.[0]?.provider || "other",
      });
    } else {
      setForm({
        name: "",
        name_en: "",
        unit: "100g",
        category: "other",
        calories: "",
        protein: "",
        fat: "",
        carbs: "",
        fiber: "",
        sugar: "",
        sodium: "",
        source: "other",
      });
    }
  }, [ingredient, open]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      showError("Tên nguyên liệu (tiếng Việt) là bắt buộc");
      return;
    }

    const payload = {
      name: form.name.trim(),
      name_en: form.name_en.trim() || undefined,
      unit: form.unit || "g",
      category: form.category || "other",
      nutrition: {
        calories: form.calories === "" ? 0 : Number(form.calories),
        protein: form.protein === "" ? 0 : Number(form.protein),
        fat: form.fat === "" ? 0 : Number(form.fat),
        carbs: form.carbs === "" ? 0 : Number(form.carbs),
        fiber: form.fiber === "" ? 0 : Number(form.fiber),
        sugar: form.sugar === "" ? 0 : Number(form.sugar),
        sodium: form.sodium === "" ? 0 : Number(form.sodium),
      },
      source: form.external_refs?.[0]?.provider || "other",
    };
    console.log("Submitting ingredient:", payload);
    onSubmit(payload);
  };

  const title = ingredient ? "Chỉnh sửa nguyên liệu" : "Thêm nguyên liệu mới";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <MDTypography variant="h6">{title}</MDTypography>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          label: {
            pb: 1,
          },
          ".css-12n1zae-MuiInputBase-root-MuiOutlinedInput-root": {
            lineHeight: "3.15",
          },
        }}
      >
        <Grid container spacing={2} mt={0.5}>
          <Grid item xs={12} md={6}>
            <TextField
              required
              fullWidth
              label="Tên tiếng Việt"
              value={form.name}
              onChange={handleChange("name")}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Tên tiếng Anh"
              value={form.name_en}
              onChange={handleChange("name_en")}
            />
          </Grid>

          {/* <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              label="Đơn vị"
              value={form.unit}
              onChange={handleChange("unit")}
              helperText="Ví dụ: g, ml, cái"
            />
          </Grid> */}
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              label="Nguồn"
              value={form.source}
              onChange={handleChange("source")}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              select
              fullWidth
              label="Nhóm"
              value={form.category}
              onChange={handleChange("category")}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <MDTypography variant="button" fontWeight="medium">
              Thông tin dinh dưỡng (trên 100g)
            </MDTypography>
          </Grid>

          {[
            { field: "calories", label: "Calories (kcal)" },
            { field: "protein", label: "Protein (g)" },
            { field: "carbs", label: "Carb (g)" },
            { field: "fat", label: "Fat (g)" },
            { field: "fiber", label: "Fiber (g)" },
            { field: "sugar", label: "Sugar (g)" },
            { field: "sodium", label: "Sodium (mg)" },
          ].map((item) => (
            <Grid key={item.field} item xs={6} md={3}>
              <TextField
                fullWidth
                type="number"
                label={item.label}
                value={form[item.field]}
                onChange={handleChange(item.field)}
                inputProps={{ min: 0, step: "any" }}
              />
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <MDButton variant="outlined" color="secondary" onClick={onClose}>
          Hủy
        </MDButton>
        <MDButton variant="contained" color="info" onClick={handleSubmit}>
          Lưu
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}
IngredientFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  ingredient: PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    name_en: PropTypes.string,
    unit: PropTypes.string,
    category: PropTypes.string,
    nutrition: PropTypes.shape({
      calories: PropTypes.number,
      protein: PropTypes.number,
      fat: PropTypes.number,
      carbs: PropTypes.number,
      fiber: PropTypes.number,
      sugar: PropTypes.number,
      sodium: PropTypes.number,
    }),
    external_refs: PropTypes.arrayOf(
      PropTypes.shape({
        provider: PropTypes.string,
        external_id: PropTypes.string,
      })
    ),
  }),
};

export default IngredientFormDialog;
