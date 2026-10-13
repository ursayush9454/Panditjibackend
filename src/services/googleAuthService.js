/**
 * Google Sign-In (ID token) verification.
 *   GOOGLE_CLIENT_ID = web client id (you may list several, comma separated: web, android, ios)
 * The app signs in with Google, sends the ID token to POST /auth/google, we verify it here.
 */
const { OAuth2Client } = require("google-auth-library");

const clientIds = () =>
  String(process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

let client = null;
const getClient = () => client || (client = new OAuth2Client());

/** test hook */
const _setClient = (c) => {
  client = c;
};

/**
 * @returns {{ googleId, email, name, picture }}
 * @throws Error with .status (400/401/503)
 */
const verifyGoogleIdToken = async (idToken) => {
  const audience = clientIds();
  if (audience.length === 0) {
    const e = new Error("Google login is not configured");
    e.status = 503;
    throw e;
  }
  if (!idToken || typeof idToken !== "string" || idToken.length > 4096) {
    const e = new Error("A valid Google idToken is required");
    e.status = 400;
    throw e;
  }

  let payload;
  try {
    const ticket = await getClient().verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch (_) {
    const e = new Error("Invalid or expired Google token");
    e.status = 401;
    throw e;
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    const e = new Error("Your Google account email is not verified");
    e.status = 401;
    throw e;
  }

  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: payload.name || "",
    picture: payload.picture || "",
  };
};

module.exports = { verifyGoogleIdToken, _setClient };
