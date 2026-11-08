const Exercise = require("../models/Exercise");
const { MUSCLE_ALIASES } = require("../utils/muscleGroups");

/**
 * Rule-based metadata for exercises imported from wger, which has no
 * difficulty / fatigue / impact of its own.
 *
 * The old version only looked for a few words in the name, so almost
 * every exercise ended up beginner / fatigue 4 / medium impact and the
 * scoring of step 5 could not tell them apart. The rules below combine
 * the name, the equipment, the muscles and the activityType.
 */

// Whole-word match, so "row" does not match "narrow" or "throw".
function hasWord(text, words) {
  return words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
}

const KEYWORDS = {
  stretching: ["stretch", "stretching", "yoga", "pose"],
  mobility: ["rotation", "mobility", "circles?", "rehab", "activation", "dislocates?"],
  compound: [
    "squats?", "deadlifts?", "press", "bench", "rows?", "rowing", "pull[- ]?ups?",
    "chin[- ]?ups?", "pull[- ]?downs?", "dips?", "lunges?", "clean", "snatch", "thrusters?",
    "hip thrusts?", "push[- ]?ups?", "step[- ]?ups?", "good mornings?",
    "burpees?", "swings?", "muscle[- ]?ups?",
  ],
  advanced: [
    "muscle[- ]?ups?", "snatch", "clean and jerk", "pistol", "handstand",
    "one[- ]arm", "single[- ]arm pull[- ]?up", "dragon flag", "planche",
    "front lever", "back lever", "human flag", "overhead squat",
  ],
  intermediate: [
    "pull[- ]?ups?", "chin[- ]?ups?", "deadlifts?", "front squat", "clean",
    "good mornings?", "bulgarian", "nordic", "l[- ]sit", "pike push[- ]?ups?",
    "decline push[- ]?ups?", "archer", "jerk",
    // Unstable rings and added load make the movement harder.
    "rings?", "weighted",
  ],
  highImpact: [
    "jumps?", "jumping", "burpees?", "box", "plyo\\w*", "sprints?", "skipping",
    "hops?", "hopping", "bounds?", "tuck", "high knees", "jack", "jacks",
    "skater", "split jumps?",
  ],
  lowImpact: ["seated", "lying", "machine", "cable", "band", "stretch", "isometric", "plank"],
};

// Load added by equipment, on top of the base fatigue of the type.
function equipmentClass(exercise) {
  const name = String(exercise.name || "").toLowerCase();
  const equipment = (exercise.equipment || []).map((e) => String(e.name || "").toLowerCase());
  const all = [...equipment, name].join(" | ");

  // Smith machine guides the bar: counted as a machine, not a barbell.
  if (/smith|cable|machine|pulley/.test(all)) return "machine";
  if (/barbell|sz-bar|ez[- ]bar/.test(all)) return "barbell";
  if (/dumbbell|kettlebell/.test(all)) return "dumbbell";
  if (/resistance band|\bband\b/.test(all)) return "band";

  return "bodyweight";
}

const EQUIPMENT_FATIGUE = {
  barbell: 2,
  dumbbell: 1,
  machine: 0,
  bodyweight: 0,
  band: -1,
};

const BASE_FATIGUE = {
  compound: 6,
  cardio: 5,
  isolation: 3,
  mobility: 2,
  stretching: 1,
};

const BIG_MUSCLE_GROUPS = ["quads", "hamstrings", "glutes", "back"];

function muscleGroupsOf(list) {
  const names = new Set(
    (list || []).flatMap((m) => [
      String(m.name_en || "").toLowerCase(),
      String(m.name || "").toLowerCase(),
    ])
  );

  return Object.keys(MUSCLE_ALIASES).filter((group) =>
    MUSCLE_ALIASES[group].some((alias) => names.has(alias))
  );
}

function detectExerciseType(exercise) {
  const name = exercise.name || "";

  if (exercise.activityType === "yoga_stretching" || hasWord(name, KEYWORDS.stretching)) {
    return "stretching";
  }

  if (hasWord(name, KEYWORDS.mobility)) {
    return "mobility";
  }

  if (
    ["cardio_machine", "hiit", "aerobic_dance"].includes(exercise.activityType) ||
    String(exercise.category || "").toLowerCase() === "cardio"
  ) {
    return "cardio";
  }

  const groups = new Set([
    ...muscleGroupsOf(exercise.muscles),
    ...muscleGroupsOf(exercise.muscles_secondary),
  ]);

  // Named compound lift, or works 3+ muscle groups.
  if (hasWord(name, KEYWORDS.compound) || groups.size >= 3) {
    return "compound";
  }

  return "isolation";
}

function detectFatigueScore(exercise, exerciseType) {
  const name = exercise.name || "";

  // A few lifts are known to be the most taxing.
  if (hasWord(name, ["deadlifts?"])) return 10;
  if (hasWord(name, ["clean", "snatch"])) return 9;
  if (hasWord(name, ["squats?"]) && equipmentClass(exercise) === "barbell") return 9;
  if (hasWord(name, ["burpees?"])) return 8;

  let score = BASE_FATIGUE[exerciseType] ?? 4;

  score += EQUIPMENT_FATIGUE[equipmentClass(exercise)];

  if (muscleGroupsOf(exercise.muscles).some((g) => BIG_MUSCLE_GROUPS.includes(g))) {
    score += 1;
  }

  return Math.max(1, Math.min(10, score));
}

function detectDifficulty(exercise, exerciseType) {
  const name = exercise.name || "";

  if (hasWord(name, KEYWORDS.advanced)) return "advanced";
  if (hasWord(name, KEYWORDS.intermediate)) return "intermediate";

  // Heavy free-weight compound lifts need technique.
  if (exerciseType === "compound" && equipmentClass(exercise) === "barbell") {
    return "intermediate";
  }

  return "beginner";
}

function detectImpactLevel(exercise, exerciseType) {
  const name = exercise.name || "";

  if (hasWord(name, KEYWORDS.highImpact) || exercise.activityType === "hiit") {
    return "high";
  }

  if (
    ["stretching", "mobility"].includes(exerciseType) ||
    hasWord(name, KEYWORDS.lowImpact) ||
    ["machine", "band"].includes(equipmentClass(exercise))
  ) {
    return "low";
  }

  return "medium";
}

function inferMetadata(exercise) {
  const exerciseType = detectExerciseType(exercise);

  return {
    exerciseType,
    difficulty: detectDifficulty(exercise, exerciseType),
    impactLevel: detectImpactLevel(exercise, exerciseType),
    fatigueScore: detectFatigueScore(exercise, exerciseType),
  };
}

/**
 * Recompute metadata for every exercise. Returns counts per value so
 * the result can be checked at a glance.
 */
async function enrichExerciseMetadata() {
  const exercises = await Exercise.find(
    {},
    {
      name: 1,
      category: 1,
      muscles: 1,
      muscles_secondary: 1,
      equipment: 1,
      activityType: 1,
    }
  ).lean();

  const summary = {
    total: exercises.length,
    exerciseType: {},
    difficulty: {},
    impactLevel: {},
    fatigueScore: {},
  };

  const operations = exercises.map((exercise) => {
    const metadata = inferMetadata(exercise);

    Object.entries(metadata).forEach(([key, value]) => {
      summary[key][value] = (summary[key][value] || 0) + 1;
    });

    return {
      updateOne: {
        filter: { _id: exercise._id },
        update: { $set: metadata },
      },
    };
  });

  if (operations.length) {
    await Exercise.bulkWrite(operations, { ordered: false });
  }

  console.log("[Exercise Metadata] Enriched successfully", summary);

  return summary;
}

module.exports = {
  enrichExerciseMetadata,
  inferMetadata,
};
