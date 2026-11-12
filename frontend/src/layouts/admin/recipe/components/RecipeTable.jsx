// src/layouts/admin/recipes/components/RecipeTable.jsx
import React from "react";
import { Box, IconButton, Tooltip, LinearProgress, Chip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import PropTypes from "prop-types";
import Pagination from "components/shared/Pagination";
import { useNavigate } from "react-router-dom";

const CATEGORY_LABEL = {
  main: "Món chính",
  side: "Món phụ",
  dessert: "Tráng miệng",
  drink: "Đồ uống",
  base_starch: "Tinh bột cơ bản",
  light_supplement: "Bổ sung nhẹ",
  one_dish_meal: "Món ăn một món",
  soup_veg: "Canh rau",
};

function Ellipsis({ text, variant = "caption", fontWeight }) {
  const safe = text ?? "-";
  return (
    <Tooltip title={safe} placement="top" arrow>
      <span
        style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        <MDTypography variant={variant} fontWeight={fontWeight} noWrap>
          {safe}
        </MDTypography>
      </span>
    </Tooltip>
  );
}

Ellipsis.propTypes = {
  text: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  variant: PropTypes.string,
  fontWeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default function RecipeTable({ 
  loading, 
  recipes, 
  pagination,
  sortBy,
  sortOrder,
  onSort,
  onEdit, 
  onDelete,
  onPageChange 
}) {
  const navigate = useNavigate();
  
  const handleSort = (field) => {
    if (onSort) {
      const newOrder = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
      onSort(field, newOrder);
    }
  };

  const handleViewDetail = (recipe) => {
    navigate(`/admin/recipes/${recipe._id}`);
  };

  // eslint-disable-next-line react/prop-types
  const SortableHeader = ({ field, children, textAlign = "left" }) => {
    if (!onSort) {
      return (
        <th
          style={{
            textAlign,
            padding: "10px 12px",
            borderBottom: "1px solid #d9d9d9",
            borderRight: "1px solid #e6e6e6",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {children}
        </th>
      );
    }
    
    return (
      <th
        style={{
          textAlign,
          padding: "10px 12px",
          borderBottom: "1px solid #d9d9d9",
          borderRight: "1px solid #e6e6e6",
          fontWeight: 600,
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
        onClick={() => handleSort(field)}
      >
        <Box display="flex" alignItems="center" gap={0.5}>
          {children}
          {sortBy === field && (
            <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
          )}
        </Box>
      </th>
    );
  };

  return (
    <MDBox mt={2}>
      {loading && <LinearProgress sx={{ mb: 1 }} />}

      <Box
        sx={{
          border: "1px solid",
          borderColor: "grey.300",
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: "background.paper",
          width: "100%",
        }}
      >
        <Box sx={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 860,
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: "35%" }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 120 }} />
            </colgroup>

            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <SortableHeader field="name">
                  <MDTypography variant="button" fontWeight="medium">
                    Tên món
                  </MDTypography>
                </SortableHeader>
                <SortableHeader field="category">
                  <MDTypography variant="button" fontWeight="medium">
                    Danh mục
                  </MDTypography>
                </SortableHeader>
                <SortableHeader field="servings" textAlign="center">
                  <MDTypography variant="button" fontWeight="medium">
                    Khẩu phần
                  </MDTypography>
                </SortableHeader>
                <SortableHeader field="createdBy">
                  <MDTypography variant="button" fontWeight="medium">
                    Người tạo
                  </MDTypography>
                </SortableHeader>
                <th
                  style={{
                    textAlign: "center",
                    padding: "10px 12px",
                    borderBottom: "1px solid #d9d9d9",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  <MDTypography variant="button" fontWeight="medium">
                    Thao tác
                  </MDTypography>
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && recipes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, textAlign: "center" }}>
                    <MDTypography variant="button" color="text">
                      Chưa có món ăn nào.
                    </MDTypography>
                  </td>
                </tr>
              ) : (
                recipes.map((recipe, idx) => (
                  <tr 
                    key={recipe._id} 
                    style={{ 
                      borderBottom: "1px solid #eee",
                      background: idx % 2 === 1 ? "rgba(0,0,0,0.01)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 12px", borderRight: "1px solid #eee" }}>
                      <Ellipsis text={recipe.name} variant="button" />
                    </td>

                    <td style={{ padding: "10px 12px", borderRight: "1px solid #eee" }}>
                      <Chip
                        label={CATEGORY_LABEL[recipe.category] || "-"}
                        color="primary"
                        size="small"
                        variant="outlined"
                      />
                    </td>

                    <td
                      style={{
                        padding: "10px 12px",
                        borderRight: "1px solid #eee",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <MDTypography variant="caption" color="text">
                        {recipe.servings || "-"}
                      </MDTypography>
                    </td>

                    <td style={{ padding: "10px 12px", borderRight: "1px solid #eee" }}>
                      <Ellipsis text={recipe.createdBy || "admin"} />
                    </td>

                    <td style={{ padding: "6px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <Tooltip title="Xem chi tiết">
                        <IconButton size="small" color="info" onClick={() => handleViewDetail(recipe)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Chỉnh sửa">
                        <IconButton size="small" onClick={() => onEdit(recipe)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Xóa">
                        <IconButton size="small" color="error" onClick={() => onDelete(recipe)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
      </Box>

      {/* Pagination */}
      {pagination && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
        />
      )}

      {/* Results count */}
      {pagination && (
        <Box mt={2} textAlign="center">
          <MDTypography variant="caption" color="text">
            Hiển thị {recipes.length} / {pagination.total} món ăn
          </MDTypography>
        </Box>
      )}
    </MDBox>
  );
}

RecipeTable.propTypes = {
  loading: PropTypes.bool,
  recipes: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string.isRequired,
      name: PropTypes.string,
      category: PropTypes.string,
      servings: PropTypes.number,
      createdBy: PropTypes.string,
    })
  ).isRequired,
  pagination: PropTypes.shape({
    page: PropTypes.number,
    limit: PropTypes.number,
    total: PropTypes.number,
    totalPages: PropTypes.number,
  }),
  sortBy: PropTypes.string,
  sortOrder: PropTypes.oneOf(["asc", "desc"]),
  onSort: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onPageChange: PropTypes.func,
};

RecipeTable.defaultProps = { 
  loading: false,
  pagination: null,
  sortBy: "createdAt",
  sortOrder: "desc",
  onSort: null,
  onPageChange: null,
};
