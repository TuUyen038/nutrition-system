const favoriteService = require("../services/favorite.service");

/**
 * Thêm món ăn vào danh sách yêu thích
 * POST /api/favorites/:recipeId
 */
exports.addFavorite = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { recipeId } = req.params;

    const result = await favoriteService.addFavorite(userId, recipeId);

    res.json({
      success: true,
      data: result,
      message: "Đã thêm vào danh sách yêu thích",
    });
  } catch (error) {
    console.error("Add favorite error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Không thể thêm vào danh sách yêu thích",
    });
  }
};

/**
 * Xóa món ăn khỏi danh sách yêu thích
 * DELETE /api/favorites/:recipeId
 */
exports.removeFavorite = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { recipeId } = req.params;

    await favoriteService.removeFavorite(userId, recipeId);

    res.json({
      success: true,
      message: "Đã xóa khỏi danh sách yêu thích",
    });
  } catch (error) {
    console.error("Remove favorite error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Không thể xóa khỏi danh sách yêu thích",
    });
  }
};

/**
 * Lấy danh sách món ăn yêu thích
 * GET /api/favorites
 */
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { page = 1, limit = 20 } = req.query;

    const result = await favoriteService.getFavoriteRecipes(userId, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: result.recipes,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get favorites error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Không thể lấy danh sách yêu thích",
    });
  }
};

/**
 * Kiểm tra xem recipe có trong danh sách yêu thích không
 * GET /api/favorites/check/:recipeId
 */
exports.checkFavorite = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { recipeId } = req.params;

    const isFavorite = await favoriteService.isFavorite(userId, recipeId);

    res.json({
      success: true,
      isFavorite,
    });
  } catch (error) {
    console.error("Check favorite error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Không thể kiểm tra trạng thái yêu thích",
    });
  }
};

/**
 * Toggle favorite (thêm nếu chưa có, xóa nếu đã có)
 * POST /api/favorites/toggle/:recipeId
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { recipeId } = req.params;

    const isFavorite = await favoriteService.isFavorite(userId, recipeId);

    if (isFavorite) {
      await favoriteService.removeFavorite(userId, recipeId);
      res.json({
        success: true,
        message: "Đã xóa khỏi danh sách yêu thích",
        isFavorite: false,
      });
    } else {
      await favoriteService.addFavorite(userId, recipeId);
      res.json({
        success: true,
        message: "Đã thêm vào danh sách yêu thích",
        isFavorite: true,
      });
    }
  } catch (error) {
    console.error("Toggle favorite error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Không thể thay đổi trạng thái yêu thích",
    });
  }
};

