const WorkoutSession = require("../models/WorkoutSession");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const ActivityMet = require("../models/ActivityMet");

const startWorkout = async ({ userId, exerciseId, intensity }) => {
  // Check if user already has active session
  const activeSession = await WorkoutSession.findOne({ userId, endTime: null });
  if (activeSession) {
    throw new Error("User already has an active workout session");
  }

  // Create new session
  const session = new WorkoutSession({
    userId,
    exerciseId,
    intensity,
    startTime: new Date(),
  });

  await session.save();
  return session;
};

const stopWorkout = async (sessionId) => {
  const session = await WorkoutSession.findById(sessionId);
  if (!session || session.endTime) {
    throw new Error("Session not found or already ended");
  }

  const endTime = new Date();
  const durationMs = endTime - session.startTime;
  const durationMinutes = durationMs / 1000 / 60;

  if (durationMinutes < 0) {
    throw new Error("Invalid duration");
  }

  // Fetch user
  const user = await User.findById(session.userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Fetch exercise
  const exercise = await Exercise.findOne({ exerciseId: session.exerciseId });
  if (!exercise) {
    throw new Error("Exercise not found");
  }

  // Query ActivityMET
  const metData = await ActivityMet.findOne({
    activityType: exercise.activityType,
    intensity: session.intensity,
  });
  if (!metData) {
    throw new Error("MET data not found");
  }

  // Calculate kcal
  const kcalBurned = metData.met * user.weight * (durationMinutes / 60);

  // Update session
  session.endTime = endTime;
  session.durationMinutes = durationMinutes;
  session.kcalBurned = kcalBurned;

  await session.save();
  return session;
};

const getTodayKcal = async (userId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const sessions = await WorkoutSession.find({
    userId,
    startTime: { $gte: startOfDay },
  });

  const totalKcal = sessions.reduce((sum, session) => sum + (session.kcalBurned || 0), 0);

  return {
    totalKcal,
  };
};

module.exports = {
  startWorkout,
  stopWorkout,
  getTodayKcal,
};