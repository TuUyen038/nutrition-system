/**
 * Names used by the exercise DB (wger) for each muscle group of
 * MUSCLE_GROUP_MAPPINGS. Matching is exact and case-insensitive, so
 * "biceps femoris" (hamstrings) never matches "biceps".
 */
const MUSCLE_ALIASES = {
  chest: ["chest", "pectoralis major"],
  shoulders: ["shoulders", "anterior deltoid", "deltoid"],
  triceps: ["triceps", "triceps brachii"],
  back: ["back", "lats", "latissimus dorsi", "trapezius"],
  biceps: ["biceps", "biceps brachii", "brachialis"],
  quads: ["quads", "quadriceps femoris"],
  hamstrings: ["hamstrings", "biceps femoris"],
  calves: ["calves", "gastrocnemius", "soleus"],
  glutes: ["glutes", "gluteus maximus"],
};

module.exports = {
  MUSCLE_ALIASES,
};
