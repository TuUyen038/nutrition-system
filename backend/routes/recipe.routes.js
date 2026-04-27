const express = require("express");
const multer = require("multer");
const router = express.Router();
const upload = multer({ dest: "uploads/" });

const {
  searchByIngredientName,
  searchByImage,
  getAllRecipe,
  findRecipeByName,
  detectImage,
  findIngrAndInstrByAi,
  getBackUpNutrition,
  createNewRecipe,
  getRecipeById,
  findIngredientsByAi,
  getRecipeStats,
  checkDuplicateName,
  updateRecipe,
  deleteRecipe,
  getIngredientSubstitutions,
} = require("../controllers/recipe.controller");

const { authenticate, authorize } = require("../middlewares/auth");

/* =====================================================
   PUBLIC ROUTES
===================================================== */

// search & filter
router.get("/search", getAllRecipe); // thay cho "/"
router.get("/search/by-ingredient", searchByIngredientName);
router.get("/search/by-name", findRecipeByName);

// stats
router.get("/stats", getRecipeStats);

// validate
router.get("/validate/duplicate-name", checkDuplicateName);

// detail
router.get("/:id", getRecipeById); // chuẩn REST


/* =====================================================
   AUTHENTICATED ROUTES
===================================================== */

router.use(authenticate);

// AI / image
router.post("/ai/search-by-image", upload.single("foodImage"), searchByImage);
router.post("/ai/detect-food", upload.single("foodImage"), detectImage);
router.post("/ai/extract-ingredients", findIngredientsByAi);
router.get("/ai/recommendations/:foodName", findIngrAndInstrByAi);

// nutrition
router.post("/nutrition/fallback", getBackUpNutrition);

// ingredient utils
router.post("/ingredients/substitutions", getIngredientSubstitutions);


/* =====================================================
   ADMIN ONLY ROUTES
===================================================== */

router.post("/", authorize("ADMIN"), createNewRecipe);
router.put("/:id", authorize("ADMIN"), updateRecipe);
router.delete("/:id", authorize("ADMIN"), deleteRecipe);

module.exports = router;