// src/layouts/admin/ingredients/index.jsx
import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import { Card, IconButton, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import IngredientFilters from "./components/IngredientFilters";
import IngredientTable from "./components/IngredientTable";
import IngredientFormDialog from "./components/IngredientFormDialog";
import DeleteConfirmDialog from "components/shared/DeleteConfirmDialog";

import {
  getIngredients,
  getIngredientStats,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  checkDuplicateName,
} from "services/ingredientApi";

import { useToast } from "context/ToastContext";
import { handleError } from "utils/errorHandler";

// Hàm chuẩn hóa dữ liệu nguyên liệu cho form
const normalizeIngredientForForm = (ingredient) => {
  if (!ingredient) return null;

  return {
    ...ingredient,
    name: ingredient.name || "",
    name_en: ingredient.name_en || "",
    unit: ingredient.unit || "g",
    category: ingredient.category || "other",
    source: ingredient.source || "",
    nutrition: {
      calories: ingredient.nutrition?.calories ?? "",
      protein: ingredient.nutrition?.protein ?? "",
      fat: ingredient.nutrition?.fat ?? "",
      carbs: ingredient.nutrition?.carbs ?? "",
      fiber: ingredient.nutrition?.fiber ?? "",
      sugar: ingredient.nutrition?.sugar ?? "",
      sodium: ingredient.nutrition?.sodium ?? "",
    },
  };
};

function IngredientManagement() {
  const { showSuccess, showError } = useToast();

  const [ingredients, setIngredients] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // Filters và pagination
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await getIngredients({
        search,
        page,
        limit,
        sortBy,
        sortOrder,
      });

      if (result.data && result.pagination) {
        setIngredients(result.data);
        setPagination(result.pagination);
      } else {
        setIngredients([]);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 1 });
      }
    } catch (err) {
      const errorMessage = handleError(err);
      showError(errorMessage);
      setIngredients([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();
  }, [search, page, sortBy, sortOrder]);

  // Reset page khi filter thay đổi
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortOrder]);

  const handleAddClick = () => {
    setEditingIngredient(null);
    setDialogOpen(true);
  };

  const handleEditClick = (ingredient) => {
    const normalized = normalizeIngredientForForm(ingredient);
    setEditingIngredient(normalized);
    setDialogOpen(true);
  };

  const handleDeleteClick = (ingredient) => {
    setIngredientToDelete(ingredient);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ingredientToDelete) return;

    try {
      setDeleting(true);
      await deleteIngredient(ingredientToDelete._id);
      showSuccess(`Đã xóa nguyên liệu "${ingredientToDelete.name}"`);
      await fetchData();
      setDeleteDialogOpen(false);
      setIngredientToDelete(null);
    } catch (err) {
      const errorMessage = handleError(err);
      showError(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingIngredient(null);
  };

  const handleDialogSubmit = async (formData) => {
    try {
      // Validation
      if (!formData.name?.trim()) {
        showError("Tên nguyên liệu (tiếng Việt) là bắt buộc");
        return;
      }

      // Check duplicate
      const isDuplicate = await checkDuplicateName(formData.name.trim(), editingIngredient?._id);

      if (isDuplicate) {
        showError(`Nguyên liệu "${formData.name}" đã tồn tại`);
        return;
      }

      // Validate nutrition values
      if (formData.nutrition) {
        const nutrition = formData.nutrition;
        if (nutrition.calories < 0 || nutrition.calories > 10000) {
          showError("Calories phải từ 0 đến 10000");
          return;
        }
        if (nutrition.protein < 0 || nutrition.protein > 1000) {
          showError("Protein phải từ 0 đến 1000g");
          return;
        }
        if (nutrition.carbs < 0 || nutrition.carbs > 1000) {
          showError("Carbs phải từ 0 đến 1000g");
          return;
        }
        if (nutrition.fat < 0 || nutrition.fat > 1000) {
          showError("Fat phải từ 0 đến 1000g");
          return;
        }
      }

      if (editingIngredient && editingIngredient._id) {
        await updateIngredient(editingIngredient._id, formData);
        showSuccess("Cập nhật nguyên liệu thành công");
      } else {
        await createIngredient(formData);
        showSuccess("Thêm nguyên liệu thành công");
      }

      await fetchData();
      handleDialogClose();
    } catch (err) {
      const errorMessage = handleError(err);
      showError(errorMessage);
    }
  };

  const handleSort = (field, order) => {
    setSortBy(field);
    setSortOrder(order);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        {/* Header + nút thêm */}
        <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <div>
            <MDTypography variant="h5" fontWeight="medium">
              Quản lý nguyên liệu
            </MDTypography>
            <MDTypography variant="button" color="text">
              Theo dõi và cập nhật dữ liệu dinh dưỡng cho từng nguyên liệu
            </MDTypography>
          </div>

          <Tooltip title="Thêm nguyên liệu mới">
            <IconButton
              color="primary"
              onClick={handleAddClick}
              sx={{
                borderRadius: "12px",
                boxShadow: 2,
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        </MDBox>

        {/* Filter + bảng */}
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card sx={{ p: 3 }}>
              <IngredientFilters search={search} onSearchChange={setSearch} />

              <Grid item xs={12} sx={{ textAlign: "right", mb: 1 }}>
                <MDTypography variant="caption" color="text">
                  * Dữ liệu dinh dưỡng được tính theo trên 100g nguyên liệu
                </MDTypography>
              </Grid>

              <IngredientTable
                loading={loading}
                ingredients={ingredients}
                pagination={pagination}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onPageChange={handlePageChange}
              />
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <IngredientFormDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSubmit={handleDialogSubmit}
        ingredient={editingIngredient}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setIngredientToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Xác nhận xóa nguyên liệu"
        itemName={ingredientToDelete?.name}
        loading={deleting}
      />
    </DashboardLayout>
  );
}

export default IngredientManagement;
