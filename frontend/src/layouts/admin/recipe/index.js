// src/layouts/admin/recipes/index.jsx
import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid";
import { Card, IconButton, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import RecipeFilters from "./components/RecipeFilters";
import RecipeTable from "./components/RecipeTable";
import RecipeFormDialog from "./components/RecipeFormDialog";
import DeleteConfirmDialog from "components/shared/DeleteConfirmDialog";

import {
  getRecipes,
  getRecipeStats,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  checkDuplicateName,
} from "services/recipeApi";
import { createIngredient, getIngredients } from "services/ingredientApi";

import { useToast } from "context/ToastContext";
import { handleError } from "utils/errorHandler";

function toUiIngredientRow(input) {
  const id = input._id?.toString?.() || crypto.randomUUID();
  return {
    _id: input._id?.toString?.(),

    name: input?.name || "",

    rawName: input?.rawName || "",

    rawText: input?.rawText || input?.rawName || input?.name || "",

    source: input?.source || (input?.rawName ? "ai" : "manual"),

    quantity: {
      amount: input?.quantity?.amount ?? "",

      unit: input?.quantity?.unit || "g",

      originalAmount: input?.quantity?.originalAmount ?? input?.quantity?.amount ?? "",

      originalUnit: input?.quantity?.originalUnit ?? input?.quantity?.unit ?? "g",

      estimate: Boolean(input?.quantity?.estimate),
    },

    // grams: input?.grams ?? "",

    ingredientId: input?.ingredientId ?? null,

    mappingName: input?.mappingName || "",
    note: input?.note || null,

    // flags: input?.flags ?? { optional: false },
  };
}
function RecipeManagement() {
  const { showSuccess, showError } = useToast();

  const [recipes, setRecipes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // Filters và pagination
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [allIngredients, setAllIngredients] = useState([]);

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      const result = await getRecipes({
        search,
        category: categoryFilter,
        page,
        limit,
        sortBy,
        sortOrder,
      });
      if (result.data && result.pagination) {
        setRecipes(result.data);
        setPagination(result.pagination);
      } else {
        setRecipes([]);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 1 });
      }
    } catch (err) {
      const errorMessage = handleError(err);
      showError(errorMessage);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllIngredients = async () => {
    try {
      // Lấy tất cả nguyên liệu bằng cách fetch nhiều trang nếu cần
      let allIngredientsList = [];
      let currentPage = 1;
      const pageSize = 1000; // Lấy 1000 mỗi lần để tránh quá tải
      let hasMore = true;

      while (hasMore) {
        const result = await getIngredients({
          limit: pageSize,
          page: currentPage,
          sortBy: "name",
          sortOrder: "asc",
        });

        if (result.data && Array.isArray(result.data)) {
          allIngredientsList = [...allIngredientsList, ...result.data];

          // Kiểm tra xem còn trang nào không
          if (result.pagination) {
            hasMore = currentPage < result.pagination.totalPages;
            currentPage++;
          } else {
            // Nếu không có pagination info, dừng lại nếu số lượng < pageSize
            hasMore = result.data.length === pageSize;
            currentPage++;
          }
        } else {
          hasMore = false;
        }
      }

      setAllIngredients(allIngredientsList);
    } catch (err) {
      console.error("Fetch ingredients for mapping error:", err);
      // Fallback: thử lấy với limit nhỏ hơn nếu lỗi
      try {
        const fallbackResult = await getIngredients({ limit: 100 });
        if (fallbackResult.data) {
          setAllIngredients(fallbackResult.data);
        }
      } catch (fallbackErr) {
        console.error("Fallback fetch ingredients error:", fallbackErr);
        setAllIngredients([]);
      }
    }
  };
  // TODO: 3 useEffect co can khong
  useEffect(() => {
    fetchRecipes();
  }, [search, categoryFilter, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchAllIngredients();
  }, []);

  // Reset page khi filter thay đổi
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, sortBy, sortOrder]);

  const handleAddClick = () => {
    setEditingRecipe(null);
    setDialogOpen(true);
  };

  const handleEditClick = (recipe) => {
    const instructionsText = Array.isArray(recipe.instructions)
      ? recipe.instructions.join("\n")
      : recipe.instructions || "";

    const uiIngredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map(toUiIngredientRow)
      : [];

    setEditingRecipe({
      ...recipe,
      instructionsText,
      ingredients: uiIngredients,
      imageUrl: recipe.imageUrl || null,
    });

    setDialogOpen(true);
  };

  const handleDeleteClick = (recipe) => {
    setRecipeToDelete(recipe);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!recipeToDelete) return;
    // TODO: nho la neu item co thay doi thi tu render lai ma, lieu co can phai goi lai fetch khong
    try {
      setDeleting(true);
      await deleteRecipe(recipeToDelete._id);
      showSuccess(`Đã xóa món ăn "${recipeToDelete.name}"`);
      await fetchRecipes();
      setDeleteDialogOpen(false);
      setRecipeToDelete(null);
    } catch (err) {
      const errorMessage = handleError(err);
      showError(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingRecipe(null);
  };

  const handleDialogSubmit = async (formData) => {
    console.log("Submit form data:", formData);
    try {
      if (!formData.name?.trim()) {
        showError("Tên món ăn là bắt buộc");
        return;
      }

      const isDuplicate = await checkDuplicateName(formData.name.trim(), editingRecipe?._id);

      if (isDuplicate) {
        showError(`Món ăn "${formData.name}" đã tồn tại`);
        return;
      }

      const payload = {};

      if (formData.name !== undefined) payload.name = formData.name;
      if (formData.description !== undefined) payload.description = formData.description;
      if (formData.category !== undefined) payload.category = formData.category;
      if (formData.servings !== undefined) payload.servings = formData.servings;
      if (formData.imageUrl !== undefined) payload.imageUrl = formData.imageUrl || "";
      if (formData.status !== undefined) payload.status = formData.status;

      if (formData.instructionsText !== undefined) {
        payload.instructions = formData.instructionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // ✅ BUILD ORIGINAL MAP
      const originalMap = new Map(
        (editingRecipe?.ingredients || []).map((ing) => [String(ing._id), ing])
      );
      // ✅ BUILD INGREDIENT PAYLOAD
      if (formData.ingredients !== undefined) {
        payload.ingredients = formData.ingredients
          .map((row) => {
            const original = originalMap.get(String(row._id));
            const isManualRow = row.source === "manual";
            const rawName = isManualRow ? "" : row.rawName || row.rawText || row.name || "";
            // Chỉ lưu name sau khi admin đã chọn nguyên liệu chuẩn hoá.
            // mappingName là candidate hiển thị tạm thời, không phải giá trị đã xác nhận.
            const nameToSave = row.name || "";

            const amount = Number(row.quantity?.amount) || 0;

            const unit = row.quantity?.unit || "g";

            const originalAmount =
              original?.quantity?.originalAmount ?? row.quantity?.originalAmount ?? amount;

            const originalUnit =
              original?.quantity?.originalUnit ?? row.quantity?.originalUnit ?? unit;

            return {
              _id: row._id ?? undefined,
              rawName: original?.rawName ?? rawName,
              rawText: original?.rawText ?? row.rawText ?? rawName,
              source: row.source || (rawName ? "ai" : "manual"),
              name: nameToSave,
              note: row.note ?? null,

              ingredientId: row.ingredientId ?? undefined,

              quantity: {
                amount: Number(row.quantity?.amount) || null,
                unit: row.quantity?.unit || "g",
                originalAmount:
                  original?.quantity?.originalAmount ?? row.quantity?.originalAmount ?? null,
                originalUnit:
                  original?.quantity?.originalUnit ?? row.quantity?.originalUnit ?? null,
              },

            };
          })
          .filter((ing) => ing.rawName || ing.name);
      }
      // SAVE
      const isDraft = formData.status === "draft";
      if (editingRecipe?._id) {
        console.log("payload con lai:", payload);
        await updateRecipe(editingRecipe._id, payload);
        showSuccess(isDraft ? "Đã lưu bản nháp món ăn" : "Cập nhật món ăn thành công");
      } else {
        console.log("payload con lai:", payload);
        await createRecipe(payload);
        showSuccess(isDraft ? "Đã lưu bản nháp món ăn" : "Thêm món ăn thành công");
      }

      await fetchRecipes();
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

  const handleCreateIngredient = async (ingredientData) => {
    const created = await createIngredient(ingredientData);
    setAllIngredients((current) => [...current, created]);
    return created;
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />

      <MDBox py={3}>
        <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <div>
            <MDTypography variant="h5" fontWeight="medium">
              Quản lý món ăn
            </MDTypography>
            <MDTypography variant="button" color="text">
              Tạo, chỉnh sửa công thức và quản lý nguyên liệu / dinh dưỡng
            </MDTypography>
          </div>

          <Tooltip title="Thêm món ăn mới">
            <IconButton
              color="primary"
              onClick={handleAddClick}
              sx={{ borderRadius: "12px", boxShadow: 2 }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        </MDBox>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card sx={{ p: 3 }}>
              <RecipeFilters
                search={search}
                onSearchChange={setSearch}
                category={categoryFilter}
                onCategoryChange={setCategoryFilter}
              />

              <RecipeTable
                loading={loading}
                recipes={recipes}
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

      <RecipeFormDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSubmit={handleDialogSubmit}
        recipe={editingRecipe}
        allIngredients={allIngredients}
        onCreateIngredient={handleCreateIngredient}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setRecipeToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Xác nhận xóa món ăn"
        itemName={recipeToDelete?.name}
        loading={deleting}
      />
    </DashboardLayout>
  );
}

export default RecipeManagement;
