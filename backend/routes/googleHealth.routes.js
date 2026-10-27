const express = require("express");
const router = express.Router();

const {
  syncHealthData,
  connectGoogle,
  googleCallback,
  getConnectionStatus,
  disconnectGoogle,
  mockSyncHealthData,
  getHealthDataByDate,
  getHealthData,
  getActivitySummary,
} = require("../controllers/googleHealth.controller");

const { authenticate } = require("../middlewares/auth");

/**
 * GET /api/google-health/callback?code=...&state=...
 *
 * Google redirects the browser here after the consent screen.
 * Must stay ABOVE router.use(authenticate): this request has no Bearer token,
 * the user is identified by the signed `state`.
 * Path must match GOOGLE_REDIRECT_URI.
 */
router.get("/callback", googleCallback);

// All endpoints below belong to the authenticated user.
router.use(authenticate);

/**
 * GET /api/google-health/connect
 *
 * Returns the Google consent URL. Frontend opens it in the browser.
 */
router.get("/connect", connectGoogle);

/**
 * GET /api/google-health/status
 *
 * Connected or not, granted scopes and metrics. Never returns tokens.
 */
router.get("/status", getConnectionStatus);

/**
 * DELETE /api/google-health/disconnect
 *
 * Revoke Google access and remove stored tokens. Synced data is kept.
 */
router.delete("/disconnect", disconnectGoogle);

/**
 * POST /api/google-health/sync?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Pull real data from Google Health API. Default: last 7 days.
 * 409 + code GOOGLE_NOT_CONNECTED / GOOGLE_TOKEN_REVOKED if not connected.
 */
router.post("/sync", syncHealthData);

/**
 * POST /api/google-health/mock-sync
 *
 * Milestone 1 endpoint.
 * Simulates data returned by Google Health/Fit and stores it in MongoDB.
 */
router.post("/mock-sync", mockSyncHealthData);

/**
 * GET /api/google-health/data?date=YYYY-MM-DD
 *
 * Get the authenticated user's health data for one day.
 */
router.get("/data/by-date", getHealthDataByDate);

/**
 * GET /api/google-health/data?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Get the authenticated user's health data in a date range.
 */
router.get("/data", getHealthData);

/**
 * GET /api/google-health/activity/summary?days=7
 *
 * Averages of steps, calories, active minutes and sleep over the last N days.
 * Metrics without data are null and are not counted in the averages.
 */
router.get("/activity/summary", getActivitySummary);

module.exports = router;
