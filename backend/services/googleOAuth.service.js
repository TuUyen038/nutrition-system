const { google } = require("googleapis");
const jwt = require("jsonwebtoken");

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

// Which metrics each scope unlocks. Used to sync only what the user granted.
const SCOPE_METRICS = {
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly":
    ["steps", "caloriesBurned", "activeMinutes", "exercise"],
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly": ["sleep"],
};

const OAUTH_STATE_PURPOSE = "google_health_oauth";

function getJwtSecret() {
  return process.env.JWT_SECRET || "your-secret-key-change-in-production";
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * State = short-lived signed token holding the userId.
 * Google sends it back unchanged on the callback, so we know which user
 * connected and that the request really started from our app.
 */
function createOAuthState(userId) {
  return jwt.sign(
    { userId: userId.toString(), purpose: OAUTH_STATE_PURPOSE },
    getJwtSecret(),
    { expiresIn: "10m" }
  );
}

function verifyOAuthState(state) {
  if (!state) {
    throw new Error("Missing OAuth state");
  }

  const decoded = jwt.verify(state, getJwtSecret());

  if (decoded.purpose !== OAUTH_STATE_PURPOSE || !decoded.userId) {
    throw new Error("Invalid OAuth state");
  }

  return decoded.userId;
}

function generateAuthUrl(state) {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);

  return tokens;
}

/**
 * Google returns granted scopes as one space-separated string.
 * The user can untick a scope on the consent screen, so this may be
 * fewer than GOOGLE_SCOPES.
 */
function parseScopes(scope) {
  if (!scope) return [];

  return scope.split(" ").filter(Boolean);
}

function getGrantedMetrics(scopes = []) {
  return scopes.flatMap((scope) => SCOPE_METRICS[scope] || []);
}

module.exports = {
  createOAuthClient,
  createOAuthState,
  verifyOAuthState,
  generateAuthUrl,
  exchangeCodeForTokens,
  parseScopes,
  getGrantedMetrics,
  GOOGLE_SCOPES,
};
