const axios = require("axios");
const Exercise = require("../models/Exercise");

const EXERCISE_API_URL = "https://wger.de/api/v2/exerciseinfo/";

async function fetchAllExerciseInfo() {
  const exercises = [];
  let nextUrl = EXERCISE_API_URL;
  let page = 1;

  while (nextUrl) {
    const response = await axios.get(nextUrl);
    const data = response.data;

    console.log(`[Exercise Import] Exercise page ${page}: ${nextUrl}`);

    if (Array.isArray(data.results)) {
      exercises.push(...data.results);
    }

    nextUrl = data.next;
    page += 1;
  }

  return exercises;
}

function getEnglishTranslation(translations) {
  if (!Array.isArray(translations)) return { name: "", description: "" };
  const translation = translations.find((t) => Number(t.language) === 2);
  return {
    name: translation?.name || "",
    description: translation?.description || "",
  };
}

function transformExercise(raw) {
  const translated = getEnglishTranslation(raw.translations);

  const categoryId = raw.category?.id ?? (typeof raw.category === "number" ? raw.category : null);
  const categoryName = raw.category?.name ?? (typeof raw.category === "string" ? raw.category : "");

  return {
    exerciseId: raw.id,
    name: translated.name || "",
    description: translated.description || "",
    categoryId,
    category: categoryName,
    muscles: raw.muscles?.map((m) => ({
      id: m.id,
      name: m.name,
      name_en: m.name_en,
    })) || [],
    muscles_secondary: raw.muscles_secondary?.map((m) => ({
      id: m.id,
      name: m.name,
      name_en: m.name_en,
    })) || [],
    equipment: raw.equipment?.map((e) => ({
      id: e.id,
      name: e.name,
    })) || [],
    images: raw.images?.map((i) => i.image) || [],
    videos: raw.videos?.map((v) => v.video) || [],
  };
}

async function importExercisesFromWger() {
  try {
    const rawExercises = await fetchAllExerciseInfo();

    const transformed = rawExercises.map((raw) => transformExercise(raw));

    if (transformed.length === 0) {
      console.log("[Exercise Import] No exercises found in wger response");
      return {
        imported: 0,
        totalFetched: 0,
      };
    }

    const operations = transformed.map((item) => ({
      updateOne: {
        filter: { exerciseId: item.exerciseId },
        update: { $set: item },
        upsert: true,
      },
    }));

    const bulkResult = await Exercise.bulkWrite(operations, { ordered: false });

    const inserted = bulkResult.upsertedCount || 0;
    const modified = bulkResult.modifiedCount || 0;
    const total = transformed.length;

    console.log(`[Exercise Import] Completed: total fetched=${total}, inserted=${inserted}, updated=${modified}`);

    return {
      imported: total,
      inserted,
      updated: modified,
      totalFetched: total,
    };
  } catch (error) {
    console.error("[Exercise Import] Failed", error);
    throw error;
  }
}

async function findExercises(filters = {}) {
  const query = {};

  if (filters.categoryId !== undefined && filters.categoryId !== null && filters.categoryId !== "") {
    query.categoryId = Number(filters.categoryId);
  }

  if (filters.muscleIds) {
    const muscleIds = Array.isArray(filters.muscleIds)
      ? filters.muscleIds.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : String(filters.muscleIds).split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
    if (muscleIds.length) {
      query["muscles.id"] = { $in: muscleIds };
    }
  }

  if (filters.equipmentIds) {
    const equipmentIds = Array.isArray(filters.equipmentIds)
      ? filters.equipmentIds.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : String(filters.equipmentIds).split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
    if (equipmentIds.length) {
      query["equipment.id"] = { $in: equipmentIds };
    }
  }

  return Exercise.find(query).sort({ exerciseId: 1 }).lean();
}

async function getAllExercises() {
  return findExercises();
}

async function getExerciseById(exerciseId) {
  return Exercise.findOne({ exerciseId }).lean();
}

/**
 * Batch fetch exercises by IDs
 * Optimized: single DB query with $in operator
 * @param {number[]} ids - Array of exercise IDs
 * @returns {Promise<Array>} Array of exercises
 */
async function getExercisesByIds(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }

  return Exercise.find({ exerciseId: { $in: ids } }).lean();
}

module.exports = {
  importExercisesFromWger,
  findExercises,
  getAllExercises,
  getExerciseById,
  getExercisesByIds,
};
