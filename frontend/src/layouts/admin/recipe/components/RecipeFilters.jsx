// src/layouts/admin/recipes/components/RecipeFilters.jsx
import { Grid, MenuItem, TextField } from "@mui/material";
import MDBox from "components/MDBox";
import PropTypes from "prop-types";

const CATEGORIES = [
  { value: "all", label: "Tất cả" },
  { value: "main", label: "Món chính" },
  { value: "side", label: "Món phụ" },
  { value: "dessert", label: "Tráng miệng" },
  { value: "drink", label: "Đồ uống" },
  { value: "base_starch", label: "Tinh bột cơ bản" },
  { value: "light_supplement", label: "Bổ sung nhẹ" },
  { value: "one_dish_meal", label: "Món ăn một món" },
  { value: "soup_veg", label: "Canh rau" },
];

export default function RecipeFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
}) {
  return (
    <MDBox mb={2}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Tìm kiếm món ăn"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            size="small"
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            select
            fullWidth
            label="Danh mục"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            size="small"
            sx={{
              label: {
                pb: 1,
              },
              ".css-12n1zae-MuiInputBase-root-MuiOutlinedInput-root": {
                lineHeight: "3.12",
              },
            }}
          >
            {CATEGORIES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>
    </MDBox>
  );
}

RecipeFilters.propTypes = {
  search: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  category: PropTypes.string.isRequired,
  onCategoryChange: PropTypes.func.isRequired,
};

