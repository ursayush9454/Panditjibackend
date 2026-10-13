/**
 * Firebase Authentication (Phone OTP + Google) -> our own JWT.
 *
 * Flow: the app signs in with Firebase (phone number OTP or Google), gets a Firebase ID token and sends it to
 * POST /auth/firebase. We verify it with firebase-admin (same FIREBASE_* credentials already used for push).
 */
const { getFirebase } = require("./notificationService");

const httpError = (status, message) => Object.assign(new Error(message), { status });

let verifierOverride = null;
/** test hook: (idToken) => decoded token */
const _setVerifier = (fn) => {
  verifierOverride = fn;
};

const maxAgeSec = () => Number(process.env.FIREBASE_AUTH_MAX_AGE_SEC || 600);

/**
 * @returns {{ uid, provider, phone, email, emailVerified, name, picture, googleId }}
 */
const verifyFirebaseIdToken = async (idToken) => {
  if (!idToken || typeof idToken !== "string" || idToken.length > 8192) {
    throw httpError(400, "A valid Firebase idToken is required");
  }

  let decoded;
  try {
    if (verifierOverride) {
      decoded = await verifierOverride(idToken);
    } else {
      const app = getFirebase();
      if (!app) throw httpError(503, "Firebase is not configured on the server");
      decoded = await require("firebase-admin").auth(app).verifyIdToken(idToken);
    }
  } catch (e) {
    if (e.status) throw e;
    throw httpError(401, "Invalid or expired Firebase token");
  }

  // A stolen old token must not be usable for a fresh login.
  const authTime = Number(decoded.auth_time || decoded.iat || 0);
  if (!authTime || Date.now() / 1000 - authTime > maxAgeSec()) {
    throw httpError(401, "Login session is too old. Please verify again.");
  }

  const provider = decoded.firebase?.sign_in_provider || "";
  return {
    uid: decoded.uid || decoded.sub,
    provider,
    phone: decoded.phone_number || "",
    email: decoded.email ? String(decoded.email).toLowerCase() : "",
    emailVerified: decoded.email_verified === true,
    name: decoded.name || "",
    picture: decoded.picture || "",
    googleId: decoded.firebase?.identities?.["google.com"]?.[0] || "",
  };
};

/**
 * Phone numbers already in the DB may be stored as "9876543210", "919876543210" or "+919876543210"
 * (the old OTP login stored whatever the app sent). Returns every spelling to look up.
 */
const phoneCandidates = (e164) => {
  const digits = String(e164 || "").replace(/\D/g, "");
  if (!digits) return [];
  const set = new Set([`+${digits}`, digits]);
  if (digits.startsWith("91") && digits.length === 12) set.add(digits.slice(2));
  if (digits.length === 10) {
    set.add(`91${digits}`);
    set.add(`+91${digits}`);
  }
  return [...set];
};

/** Format used for NEW accounts: 10 digits for India (+91), full E.164 otherwise. */
const canonicalPhone = (e164) => {
  const digits = String(e164 || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  return `+${digits}`;
};

module.exports = { verifyFirebaseIdToken, phoneCandidates, canonicalPhone, _setVerifier };
