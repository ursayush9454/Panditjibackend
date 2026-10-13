const crypto = require("crypto");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sign } = require("../utils/auth");
const { sendOtpSms } = require("../services/smsService");
const { verifyGoogleIdToken } = require("../services/googleAuthService");
const {
  verifyFirebaseIdToken,
  phoneCandidates,
  canonicalPhone,
} = require("../services/firebaseAuthService");

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

const normalizePhone = (value) => {
  const cleaned = String(value || "").replace(/[\s-]/g, "");
  return /^\+?\d{10,15}$/.test(cleaned) ? cleaned : null;
};

const hashOtp = (phone, otp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${phone}:${otp}`).digest("hex");

const devOtpAllowed = () =>
  process.env.OTP_DEV_MODE === "true" && process.env.NODE_ENV !== "production";

// AUTH_OTP_MODE: "firebase" = only Firebase phone login, "sms" = only our own OTP (MSG91), "both" (default)
const otpMode = () => String(process.env.AUTH_OTP_MODE || "both").toLowerCase();
const smsOtpDisabled = (res) =>
  res.status(400).json({
    success: false,
    useFirebase: true,
    message: "OTP login is handled by Firebase. Verify the phone in the app and call POST /auth/firebase.",
  });

exports.sendOtp = async (req, res) => {
  if (otpMode() === "firebase") return smsOtpDisabled(res);
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: "A valid phone number is required" });
    }

    const existing = await Otp.findOne({ phone });
    if (existing && Date.now() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ success: false, message: "Please wait before requesting another OTP" });
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    await Otp.findOneAndUpdate(
      { phone },
      {
        otp: hashOtp(phone, otp),
        expiresAt: new Date(Date.now() + Number(process.env.OTP_EXPIRES_MINUTES || 5) * 60000),
        attempts: 0,
      },
      { upsert: true, new: true }
    );

    await sendOtpSms({ phone, otp });

    return res.json({
      success: true,
      message: "OTP sent",
      ...(devOtpAllowed() ? { devOtp: otp } : {}),
    });
  } catch (error) {
    console.error("Send OTP Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

exports.verifyOtp = async (req, res) => {
  if (otpMode() === "firebase") return smsOtpDisabled(res);
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp || "");
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required" });
    }

    const rec = await Otp.findOne({ phone });
    if (!rec || rec.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }
    if (rec.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: rec._id });
      return res.status(429).json({ success: false, message: "Too many attempts. Request a new OTP." });
    }

    const a = Buffer.from(hashOtp(phone, otp));
    const b = Buffer.from(rec.otp);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await Otp.updateOne({ _id: rec._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // single use, even under parallel requests
    const consumed = await Otp.findOneAndDelete({ _id: rec._id });
    if (!consumed) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, role: "customer", status: "approved" });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ success: false, message: "Your account is suspended" });
    }

    return res.json({ success: true, token: sign(user), user });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user });
  } catch (error) {
    console.error("Get Me Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const emailRegex = (email) => new RegExp(`^${escapeRegex(email)}$`, "i");

const authResponse = (user, extra = {}) => ({
  success: true,
  token: sign(user),
  user,
  needsPhone: !user.phone,
  ...extra,
});

/**
 * Finds (or creates) the account for a verified Google identity.
 * - known googleId or verified e-mail of an existing account -> that account
 * - otherwise a NEW customer account is created (phone can be verified/linked later)
 */
const loginWithGoogleIdentity = async (res, g) => {
  let user = await User.findOne({ googleId: g.googleId });
  let isNewUser = false;

  if (!user) {
    const byEmail = await User.findOne({ email: emailRegex(g.email) });
    if (byEmail && (!byEmail.googleId || byEmail.googleId === g.googleId)) user = byEmail;
  }

  if (!user) {
    user = await User.create({
      email: g.email,
      googleId: g.googleId,
      name: g.name || undefined,
      profileImage: g.picture || undefined,
      role: "customer",
      status: "approved",
    });
    isNewUser = true;
  } else {
    if (user.status === "suspended") {
      return res.status(403).json({ success: false, message: "Your account is suspended" });
    }
    let changed = false;
    if (!user.googleId) {
      user.googleId = g.googleId;
      changed = true;
    }
    if (!user.name && g.name) {
      user.name = g.name;
      changed = true;
    }
    if (!user.profileImage && g.picture) {
      user.profileImage = g.picture;
      changed = true;
    }
    if (changed) await user.save();
  }

  return res.status(isNewUser ? 201 : 200).json(authResponse(user, { isNewUser }));
};

const handleAuthError = (res, name, error) => {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: "This account already exists. Please try again." });
  }
  console.error(`${name} Error:`, error);
  return res.status(500).json({ success: false, message: "Login failed" });
};

/**
 * POST /auth/google  { idToken }   (Google ID token from Google Sign-In)
 * Signs in directly. New Google users get a customer account straight away.
 */
exports.googleLogin = async (req, res) => {
  try {
    const g = await verifyGoogleIdToken(req.body.idToken);
    return await loginWithGoogleIdentity(res, g);
  } catch (error) {
    return handleAuthError(res, "Google Login", error);
  }
};

/**
 * POST /auth/firebase  { idToken }   (Firebase ID token)
 *  - phone sign-in  (Firebase Phone Auth OTP)  -> login / create account by phone number
 *  - google.com sign-in via Firebase           -> same as /auth/google
 */
exports.firebaseLogin = async (req, res) => {
  try {
    const f = await verifyFirebaseIdToken(req.body.idToken);

    if (f.provider === "google.com") {
      if (!f.email || !f.emailVerified) {
        return res.status(401).json({ success: false, message: "Your Google account email is not verified" });
      }
      return await loginWithGoogleIdentity(res, {
        googleId: f.googleId || f.uid,
        email: f.email,
        name: f.name,
        picture: f.picture,
      });
    }

    if (f.provider !== "phone" || !f.phone) {
      return res.status(400).json({ success: false, message: "Unsupported Firebase sign-in method" });
    }

    let user = await User.findOne({ phone: { $in: phoneCandidates(f.phone) } });
    let isNewUser = false;

    if (!user) {
      user = await User.create({ phone: canonicalPhone(f.phone), role: "customer", status: "approved" });
      isNewUser = true;
    }
    if (user.status === "suspended") {
      return res.status(403).json({ success: false, message: "Your account is suspended" });
    }

    return res.status(isNewUser ? 201 : 200).json(authResponse(user, { isNewUser }));
  } catch (error) {
    return handleAuthError(res, "Firebase Login", error);
  }
};

/**
 * POST /auth/phone/link  { idToken }   (logged in; Firebase phone token)
 * Adds a VERIFIED phone number to an account (e.g. one created with Google).
 */
exports.linkPhone = async (req, res) => {
  try {
    const f = await verifyFirebaseIdToken(req.body.idToken);
    if (f.provider !== "phone" || !f.phone) {
      return res.status(400).json({ success: false, message: "A Firebase phone verification token is required" });
    }

    const clash = await User.findOne({ _id: { $ne: req.user._id }, phone: { $in: phoneCandidates(f.phone) } });
    if (clash) {
      return res.status(409).json({ success: false, message: "This phone number is already used by another account" });
    }

    const user = await User.findById(req.user._id);
    user.phone = canonicalPhone(f.phone);
    await user.save();
    return res.json({ success: true, message: "Phone number verified and saved", user });
  } catch (error) {
    return handleAuthError(res, "Link Phone", error);
  }
};

/** POST /auth/google/link  { idToken }   (logged in) - attach Google to an existing account */
exports.linkGoogle = async (req, res) => {
  try {
    const g = await verifyGoogleIdToken(req.body.idToken);

    const clash = await User.findOne({
      _id: { $ne: req.user._id },
      $or: [{ googleId: g.googleId }, { email: emailRegex(g.email) }],
    });
    if (clash) {
      return res.status(409).json({ success: false, message: "This Google account is already used by another user" });
    }

    const user = await User.findById(req.user._id);
    user.googleId = g.googleId;
    if (!user.email) user.email = g.email;
    if (!user.name && g.name) user.name = g.name;
    await user.save();

    return res.json({ success: true, message: "Google account linked", user });
  } catch (error) {
    return handleAuthError(res, "Link Google", error);
  }
};
