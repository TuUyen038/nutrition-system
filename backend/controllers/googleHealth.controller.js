const googleHealthService = require("../services/googleHealth.service");
const googleConnectionService = require("../services/googleConnection.service");

async function mockSyncHealthData(req, res) {
  try {
    const userId = req.user._id;
    const data = await googleHealthService.syncMockHealthData(
      userId,
      req.body || {}
    );

    return res.status(200).json({
      success: true,
      message:
        "Mock health data synchronized successfully. This endpoint simulates Google Health/Fit data.",
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] mockSyncHealthData error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to synchronize health data",
    });
  }
}

async function getHealthDataByDate(req, res) {
  try {
    const userId = req.user._id;
    const { date } = req.query;

    const data = await googleHealthService.getHealthDataByDate(
      userId,
      date
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] getHealthDataByDate error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch health data",
    });
  }
}

async function getHealthData(req, res) {
  try {
    const userId = req.user._id;
    const { from, to } = req.query;

    const data = await googleHealthService.getHealthData(
      userId,
      from,
      to
    );

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] getHealthData error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch health data",
    });
  }
}

async function getActivitySummary(req, res) {
  try {
    const userId = req.user._id;
    const { days = 7 } = req.query;

    const data = await googleHealthService.getActivitySummary(
      userId,
      days
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] getActivitySummary error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch activity summary",
    });
  }
}

async function syncHealthData(req, res) {
  try {
    const { from, to, debug } = req.query;

    const data = await googleHealthService.syncGoogleHealthData(
      req.user._id,
      { from, to, debug: debug === "true" }
    );

    return res.status(200).json({
      success: true,
      message: "Google Health data synchronized",
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] syncHealthData error:",
      error.message || error
    );

    // Not connected / revoked: frontend should show the "Connect Google" button.
    if (
      error.code === "GOOGLE_NOT_CONNECTED" ||
      error.code === "GOOGLE_TOKEN_REVOKED"
    ) {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to synchronize Google Health data",
    });
  }
}

async function connectGoogle(req, res) {
  try {
    const url = googleConnectionService.getConnectUrl(req.user._id);

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] connectGoogle error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create Google connect URL",
    });
  }
}

/**
 * Google redirects the browser here, so there is no Bearer token.
 * The user is identified by the signed `state` instead.
 */
async function googleCallback(req, res) {
  const { code, state, error: googleError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL;

  try {
    // User clicked "Cancel" on the Google consent screen.
    if (googleError) {
      throw new Error(`Google authorization failed: ${googleError}`);
    }

    const data = await googleConnectionService.handleOAuthCallback({
      code,
      state,
    });

    if (frontendUrl) {
      return res.redirect(`${frontendUrl}?googleHealth=connected`);
    }

    return res.status(200).json({
      success: true,
      message: "Google Health connected successfully",
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] googleCallback error:",
      error.message || error
    );

    if (frontendUrl) {
      return res.redirect(`${frontendUrl}?googleHealth=error`);
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to connect Google Health",
    });
  }
}

async function getConnectionStatus(req, res) {
  try {
    const data = await googleConnectionService.getConnectionStatus(
      req.user._id
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] getConnectionStatus error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch connection status",
    });
  }
}

async function disconnectGoogle(req, res) {
  try {
    const data = await googleConnectionService.disconnect(req.user._id);

    return res.status(200).json({
      success: true,
      message: data.disconnected
        ? "Google Health disconnected"
        : "Google Health was not connected",
      data,
    });
  } catch (error) {
    console.error(
      "[Google Health Controller] disconnectGoogle error:",
      error.message || error
    );

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to disconnect Google Health",
    });
  }
}

module.exports = {
  syncHealthData,
  connectGoogle,
  googleCallback,
  getConnectionStatus,
  disconnectGoogle,
  mockSyncHealthData,
  getActivitySummary,
  getHealthDataByDate,
  getHealthData,
};
