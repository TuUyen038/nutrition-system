const express = require('express');
const dailyMenuController = require('../controllers/dailyMenu.controller');
const { authenticate } = require('../middlewares/auth');
const rcmController = require("../controllers/mealRcm.controller");
const { validateAdd, validateUpdateRecipe, validateDeleteRecipe, validateUpdateStatus } = require('../middlewares/dailyMenu.validator');

const router = express.Router();

// Tất cả route đều cần xác thực
router.use(authenticate);

router.post("/add-recipe", validateAdd, dailyMenuController.addRecipe);
router.patch("/update-status", validateUpdateStatus, dailyMenuController.updateStatus);
router.patch("/update-recipe", validateUpdateRecipe, dailyMenuController.updateRecipe);
router.delete("/delete-recipe", validateDeleteRecipe, dailyMenuController.deleteRecipe);
router.post("/recommendations/day", dailyMenuController.suggestDailyMenuV2);

//v1
// router.post("/suggest", dailyMenuController.suggestDailyMenu);
// router.get('/recipes', dailyMenuController.getRecipesByDateAndStatus)
// router.post('/', validateCreateDailyMenu, dailyMenuController.createDailyMenu);

module.exports = router;