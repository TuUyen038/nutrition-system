const GoogleConnection = require("../models/GoogleConnection");
const googleOAuthService = require("./googleOAuth.service");

// Refresh a bit before the real expiry so a request never starts
// with a token that dies halfway.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

function getConnectUrl(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const state = googleOAuthService.createOAuthState(userId);

  return googleOAuthService.generateAuthUrl(state);
}

/**
 * Called when Google redirects back with ?code=...&state=...
 */
async function handleOAuthCallback({ code, state }) {
  if (!code) {
    throw new Error("Missing authorization code");
  }

  const userId = googleOAuthService.verifyOAuthState(state);

  const tokens = await googleOAuthService.exchangeCodeForTokens(code);

  if (!tokens.access_token) {
    throw new Error("Google did not return an access token");
  }

  const scopes = googleOAuthService.parseScopes(tokens.scope);

  const update = {
    accessToken: tokens.access_token,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes,
    status: "active",
    connectedAt: new Date(),
  };

  // Google only sends refresh_token on consent. If it is missing,
  // keep the one already stored instead of overwriting it with null.
  if (tokens.refresh_token) {
    update.refreshToken = tokens.refresh_token;
  }

  const connection = await GoogleConnection.findOneAndUpdate(
    { userId },
    { $set: update },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  console.log(
    `[Google OAuth] User ${userId} connected. Scopes: ${scopes.join(", ") || "none"}`
  );

  return toPublicStatus(connection);
}

/**
 * Safe view of a connection: never expose tokens to the client.
 */
function toPublicStatus(connection) {
  if (!connection) {
    return {
      connected: false,
      status: null,
      scopes: [],
      grantedMetrics: [],
      connectedAt: null,
      lastSyncedAt: null,
    };
  }

  return {
    connected: connection.status === "active",
    status: connection.status,
    scopes: connection.scopes,
    grantedMetrics: googleOAuthService.getGrantedMetrics(connection.scopes),
    connectedAt: connection.connectedAt,
    lastSyncedAt: connection.lastSyncedAt,
  };
}

async function getConnectionStatus(userId) {
  const connection = await GoogleConnection.findOne({ userId }).lean();

  return toPublicStatus(connection);
}

/**
 * Returns an OAuth2 client ready to call Google Health API,
 * or throws GOOGLE_NOT_CONNECTED / GOOGLE_TOKEN_REVOKED.
 * Refreshed tokens are written back to MongoDB.
 */
async function getAuthorizedClient(userId) {
  const connection = await GoogleConnection.findOne({ userId });

  if (!connection) {
    const error = new Error("Google Health is not connected");
    error.code = "GOOGLE_NOT_CONNECTED";
    throw error;
  }

  if (connection.status !== "active") {
    const error = new Error("Google Health access was revoked, please connect again");
    error.code = "GOOGLE_TOKEN_REVOKED";
    throw error;
  }

  const client = googleOAuthService.createOAuthClient();

  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken || undefined,
    expiry_date: connection.tokenExpiry ? connection.tokenExpiry.getTime() : undefined,
  });

  // googleapis emits "tokens" whenever it refreshes the access token.
  client.on("tokens", async (tokens) => {
    try {
      const update = {};

      if (tokens.access_token) update.accessToken = tokens.access_token;
      if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) update.tokenExpiry = new Date(tokens.expiry_date);

      await GoogleConnection.updateOne({ userId }, { $set: update });
    } catch (err) {
      console.error("[Google OAuth] Failed to save refreshed tokens:", err.message);
    }
  });

  const expiresAt = connection.tokenExpiry ? connection.tokenExpiry.getTime() : 0;

  if (expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
    if (!connection.refreshToken) {
      await markRevoked(userId);
      const error = new Error("Google access token expired and no refresh token is stored, please connect again");
      error.code = "GOOGLE_TOKEN_REVOKED";
      throw error;
    }

    try {
      // Forces a refresh now; the "tokens" listener above saves the result.
      await client.getAccessToken();
    } catch (err) {
      // invalid_grant = user removed the app in their Google account,
      // or the refresh token expired.
      if (err.response?.data?.error === "invalid_grant") {
        await markRevoked(userId);
        const error = new Error("Google Health access was revoked, please connect again");
        error.code = "GOOGLE_TOKEN_REVOKED";
        throw error;
      }

      throw err;
    }
  }

  return { client, scopes: connection.scopes };
}

async function markRevoked(userId) {
  await GoogleConnection.updateOne(
    { userId },
    { $set: { status: "revoked" } }
  );
}

/**
 * Revoke on Google (best effort) and remove stored tokens.
 * Health data already synced is kept: it is still the user's real history.
 */
async function disconnect(userId) {
  const connection = await GoogleConnection.findOne({ userId });

  if (!connection) {
    return { disconnected: false };
  }

  const tokenToRevoke = connection.refreshToken || connection.accessToken;

  try {
    const client = googleOAuthService.createOAuthClient();
    await client.revokeToken(tokenToRevoke);
  } catch (err) {
    // Token may already be invalid on Google side; local cleanup still matters.
    console.warn("[Google OAuth] Revoke failed:", err.message);
  }

  await GoogleConnection.deleteOne({ userId });

  return { disconnected: true };
}

async function markSynced(userId) {
  await GoogleConnection.updateOne(
    { userId },
    { $set: { lastSyncedAt: new Date() } }
  );
}

module.exports = {
  getConnectUrl,
  handleOAuthCallback,
  getConnectionStatus,
  getAuthorizedClient,
  disconnect,
  markSynced,
};
