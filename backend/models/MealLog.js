const mongoose = require("mongoose");

/**
 * MealLog – lưu lịch sử từng bữa ăn của user.
 * Mỗi document = 1 ngày ăn, gồm nhiều bữa (breakfast/lunch/dinner).
 */
const mealItemSchema = new mongoose.Schema(
    {
        recipeId:     { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
        name:         { type: String, required: true },
        category:     { type: String },
        scale:        { type: Number, default: 1.0 },
        mealSource:{
            type: String,
            enum: ["chicken", "pork", "beef", "seafood", "egg", "tofu", "other", "none"],
            default: "none",
        },
        nutrition: {
            calories: { type: Number, default: 0 },
            protein:  { type: Number, default: 0 },
            fat:      { type: Number, default: 0 },
            carbs:    { type: Number, default: 0 },
        },
    },
    { _id: false }
);

const mealSlotSchema = new mongoose.Schema(
    {
        mealType: {
            type: String,
            enum: ["breakfast", "lunch", "dinner", "snack"],
            required: true,
        },
        items: [mealItemSchema],
        totalNutrition: {
            calories: { type: Number, default: 0 },
            protein:  { type: Number, default: 0 },
            fat:      { type: Number, default: 0 },
            carbs:    { type: Number, default: 0 },
        },
    },
    { _id: false }
);

const mealLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // Lưu dạng date-only (YYYY-MM-DD) quy về UTC midnight để dễ query theo ngày
        date: { type: Date, required: true, index: true },

        meals: [mealSlotSchema],

        // Tổng cả ngày (denormalized)
        dailyTotalNutrition: {
            calories: { type: Number, default: 0 },
            protein:  { type: Number, default: 0 },
            fat:      { type: Number, default: 0 },
            carbs:    { type: Number, default: 0 },
        },

        // Target dinh dưỡng cho ngày (sau khi điều chỉnh adaptive)
        dailyTargetNutrition: {
            calories: { type: Number, default: 0 },
            protein:  { type: Number, default: 0 },
            fat:      { type: Number, default: 0 },
            carbs:    { type: Number, default: 0 },
        },

        source: {
            type: String,
            enum: ["recommended", "manual"],
            default: "recommended",
        },

        // User đánh giá thực đơn ngày hôm đó
        rating: { type: Number, min: 1, max: 5, default: null },
        feedback: { type: String, default: null },
    },
    { timestamps: true }
);

mealLogSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model("MealLog", mealLogSchema);