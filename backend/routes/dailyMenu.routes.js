const express = require('express');
const dailyMenuController = require('../controllers/dailyMenu.controller');
const { authenticate } = require('../middlewares/auth');
const rcmController = require("../controllers/mealRcm.controller");
const router = express.Router();

// Tất cả route đều cần xác thực
router.use(authenticate);

router.post('/', dailyMenuController.createDailyMenu);
// router.get('/', dailyMenuController.getAllDailyMenu);
router.get('/recipes', dailyMenuController.getRecipesByDateAndStatus)
router.get('/history', dailyMenuController.getHistory);
// router.get('/:id', dailyMenuController.getDailyMenuById);
router.post("/add-recipe", dailyMenuController.addRecipeToDailyMenu);
router.put('/:mealId/status', dailyMenuController.updateStatus);
router.put('/:mealId', dailyMenuController.updateMeal);
router.post("/suggest", dailyMenuController.suggestDailyMenu);

router.post("/recommendations/day", rcmController.recommendDay);

module.exports = router;