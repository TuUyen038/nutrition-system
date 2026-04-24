const Joi = require("joi");

// Regex kiểm tra MongoDB ObjectId (24 ký tự hex)
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const schemas = {
  add: Joi.object({
    date: Joi.string().isoDate().required(), // Định dạng YYYY-MM-DD
    dailyMenuId: Joi.string().pattern(objectIdPattern).optional(),
    recipeId: Joi.string().pattern(objectIdPattern).required(),
    scale: Joi.number().positive().default(1),
    servingTime: Joi.string()
      .valid("breakfast", "lunch", "dinner", "snack", "other")
      .default("other"),
    status: Joi.string().valid("manual", "suggested").required(),
  }),

  updateRecipe: Joi.object({
    date: Joi.string().isoDate().required(),
    dailyMenuId: Joi.string().pattern(objectIdPattern).required(),
    recipeItemId: Joi.string().pattern(objectIdPattern).required(),
    newScale: Joi.number().min(0).optional(), // Cho phép = 0 để xóa
    checked: Joi.boolean().optional(),
  }),

  deleteRecipe: Joi.object({
    dailyMenuId: Joi.string().pattern(objectIdPattern).required(),
    recipeItemId: Joi.string().pattern(objectIdPattern).required(),
  }),

  updateStatus: Joi.object({
    dailyMenuId: Joi.string().pattern(objectIdPattern).required(),
    newStatus: Joi.string()
      .valid(
        "manual",
        "suggested",
        "selected",
        "completed",
        "deleted",
        "expired",
      )
      .required(),
  }),
};

// Hàm middleware dùng chung
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false, // Hiện tất cả lỗi (nếu có) thay vì dừng ở lỗi đầu tiên
    stripUnknown: true, // Loại bỏ các trường không nằm trong schema (bảo mật)
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Dữ liệu không hợp lệ",
      details: error.details.map((err) => err.message),
    });
  }

  // Gán dữ liệu sạch vào req để Controller dùng
  req.validatedData = value;
  next();
};

module.exports = {
  validateAdd: validate(schemas.add),
  validateUpdateRecipe: validate(schemas.updateRecipe),
  validateDeleteRecipe: validate(schemas.deleteRecipe),
  validateUpdateStatus: validate(schemas.updateStatus),
};
