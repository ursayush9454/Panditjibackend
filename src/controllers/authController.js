
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sign } = require("../utils/auth");
const { sendOtpSms } = require("../services/smsService");
const { verifyGoogleIdToken } = require("../services/googleAuthService");
const {
  sendMail,
  configured: emailConfigured,
} = require("../services/emailService");

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

const normalizeEmail = (value) =>
  String(value || "").trim().toLowerCase();

const hashOtp = (phone, otp) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${phone}:${otp}`)
    .digest("hex");
};

const hashEmailOtp = (email, otp) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`email:${email}:${otp}`)
    .digest("hex");
};

const hashPasswordResetOtp = (email, otp) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`password-reset:${email}:${otp}`)
    .digest("hex");
};

const validPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 128;

const publicUser = (user) => {
  const result = user?.toObject ? user.toObject() : { ...user };

  if (!result) return result;

  delete result.passwordHash;
  delete result.__v;

  return result;
};

const devOtpAllowed = () =>
  process.env.OTP_DEV_MODE === "true" &&
  process.env.NODE_ENV !== "production";

const otpMode = () =>
  String(process.env.AUTH_OTP_MODE || "both").toLowerCase();

const smsOtpDisabled = (res) =>
  res.status(400).json({
    success: false,
    useFirebase: true,
    message:
      "OTP login is handled by Firebase. Verify the phone in the app and call POST /auth/firebase.",
  });

const validEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const emailRegex = (email) =>
  new RegExp(`^${escapeRegex(email)}$`, "i");

const authResponse = (user, extra = {}) => ({
  success: true,
  token: sign(user),
  user: publicUser(user),
  needsPhone: !user.phone,
  ...extra,
});

// --------------------------------------------------
// PHONE OTP — existing SMS mode, disabled in Firebase mode
// --------------------------------------------------

exports.sendOtp = async (req, res) => {
  if (otpMode() === "firebase") return smsOtpDisabled(res);

  try {
    const phone = normalizePhone(req.body?.phone);

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "A valid phone number is required",
      });
    }

    const existing = await Otp.findOne({ phone });

    if (
      existing?.updatedAt &&
      Date.now() - existing.updatedAt.getTime() <
        RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP",
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    await Otp.findOneAndUpdate(
      { phone },
      {
        $set: {
          otp: hashOtp(phone, otp),
          expiresAt: new Date(
            Date.now() +
              Number(process.env.OTP_EXPIRES_MINUTES || 5) * 60000
          ),
          attempts: 0,
        },
        $unset: { email: 1, purpose: 1 },
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

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

exports.verifyOtp = async (req, res) => {
  if (otpMode() === "firebase") return smsOtpDisabled(res);

  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!phone || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Phone and six-digit OTP are required",
      });
    }

    const rec = await Otp.findOne({ phone });

    if (!rec || !rec.expiresAt || rec.expiresAt <= new Date()) {
      if (rec) await Otp.deleteOne({ _id: rec._id });

      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    if (rec.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: rec._id });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Request a new OTP.",
      });
    }

    const expected = hashOtp(phone, otp);
    const stored = String(rec.otp || "");

    const matches =
      /^[a-f0-9]{64}$/i.test(stored) &&
      crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(stored, "hex")
      );

    if (!matches) {
      rec.attempts += 1;
      await rec.save();

      if (rec.attempts >= MAX_ATTEMPTS) {
        await Otp.deleteOne({ _id: rec._id });
      }

      return res.status(rec.attempts >= MAX_ATTEMPTS ? 429 : 400).json({
        success: false,
        message:
          rec.attempts >= MAX_ATTEMPTS
            ? "Too many attempts. Request a new OTP."
            : "Invalid or expired OTP",
      });
    }

    // Single-use OTP.
    const consumed = await Otp.findOneAndDelete({ _id: rec._id });

    if (!consumed) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        phone,
        role: "customer",
        status: "approved",
      });
    }

    if (user.status === "suspended" || user.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended",
      });
    }

    return res.json(authResponse(user));
  } catch (error) {
    console.error("Verify OTP Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
};



// --------------------------------------------------
// EMAIL + PASSWORD LOGIN
// POST /auth/login
// --------------------------------------------------

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (
      !validEmail(email) ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid email and password are required",
      });
    }

    const user = await User.findOne({
      email: emailRegex(email),
    }).select("+passwordHash");

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password. If you have not set a password, use Forgot Password.",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);

    if (!matches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    return res.json(authResponse(user));
  } catch (error) {
    console.error("[Email Password Login]", error.message);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// --------------------------------------------------
// FORGOT PASSWORD — SEND PASSWORD-RESET OTP
// POST /auth/forgot-password
// --------------------------------------------------

exports.forgotPassword = async (req, res) => {
  const genericResponse = {
    success: true,
    message:
      "If an account exists for that email, a password-reset code has been sent.",
  };

  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server authentication configuration is missing",
      });
    }

    if (!emailConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Email service is not configured",
      });
    }

    const user = await User.findOne({
      email: emailRegex(email),
    }).select("_id email");

    if (!user) {
      return res.json(genericResponse);
    }

    const existing = await Otp.findOne({
      email,
      purpose: "password_reset",
    });

    const now = Date.now();

    if (
      existing?.updatedAt &&
      now - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return res.json(genericResponse);
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    const expiresMinutes = Math.max(
      1,
      Number(process.env.OTP_EXPIRES_MINUTES || 5)
    );

    const expiresAt = new Date(now + expiresMinutes * 60 * 1000);

    await sendMail({
      to: email,
      subject: "Reset your Vaidic Sanskar password",
      text:
        `Your Vaidic Sanskar password-reset code is ${otp}.\n\n` +
        `This code expires in ${expiresMinutes} minutes.\n` +
        "If you did not request a password reset, you can ignore this email.",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2>Vaidic Sanskar</h2>
          <p>Use this code to reset your password:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 0">
            ${otp}
          </div>
          <p>This code expires in ${expiresMinutes} minutes.</p>
          <p>If you did not request a password reset, ignore this email.</p>
        </div>
      `,
    });

    await Otp.findOneAndUpdate(
      { email, purpose: "password_reset" },
      {
        $set: {
          email,
          purpose: "password_reset",
          otp: hashPasswordResetOtp(email, otp),
          expiresAt,
          attempts: 0,
        },
        $unset: { phone: 1 },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json(genericResponse);
  } catch (error) {
    console.error("[Forgot Password]", error.message);

    return res.status(502).json({
      success: false,
      message:
        "Password-reset email could not be sent. Check email configuration and server logs.",
    });
  }
};

// --------------------------------------------------
// RESET PASSWORD — VERIFY RESET OTP AND STORE HASHED PASSWORD
// POST /auth/reset-password
// --------------------------------------------------

exports.resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    const newPassword = req.body?.newPassword;

    if (
      !validEmail(email) ||
      !/^\d{6}$/.test(otp) ||
      !validPassword(newPassword)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid email, six-digit OTP, and password of 8-128 characters are required",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server authentication configuration is missing",
      });
    }

    const rec = await Otp.findOne({
      email,
      purpose: "password_reset",
    });

    if (!rec || !rec.expiresAt || rec.expiresAt <= new Date()) {
      if (rec) await Otp.deleteOne({ _id: rec._id });

      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset code",
      });
    }

    if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: rec._id });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Request a new reset code.",
      });
    }

    const expected = hashPasswordResetOtp(email, otp);
    const stored = String(rec.otp || "");

    const matches =
      /^[a-f0-9]{64}$/i.test(stored) &&
      crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(stored, "hex")
      );

    if (!matches) {
      rec.attempts = (rec.attempts || 0) + 1;
      await rec.save();

      const blocked = rec.attempts >= MAX_ATTEMPTS;

      if (blocked) {
        await Otp.deleteOne({ _id: rec._id });
      }

      return res.status(blocked ? 429 : 400).json({
        success: false,
        message: blocked
          ? "Too many attempts. Request a new reset code."
          : "Invalid or expired reset code",
        ...(!blocked
          ? { attemptsRemaining: MAX_ATTEMPTS - rec.attempts }
          : {}),
      });
    }

    // Consume the reset code so it cannot be reused.
    const consumed = await Otp.findOneAndDelete({
      _id: rec._id,
      email,
      purpose: "password_reset",
    });

    if (!consumed) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset code",
      });
    }

    const user = await User.findOne({
      email: emailRegex(email),
    }).select("+passwordHash");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset code",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({
      success: true,
      message:
        "Password reset successful. Please log in using your new password.",
    });
  } catch (error) {
    console.error("[Reset Password]", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get Me Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};

// --------------------------------------------------
// GOOGLE AUTH HELPERS
// --------------------------------------------------

const loginWithGoogleIdentity = async (res, g) => {
  let user = await User.findOne({ googleId: g.googleId });
  let isNewUser = false;

  if (!user) {
    const byEmail = await User.findOne({
      email: emailRegex(g.email),
    });

    if (byEmail && (!byEmail.googleId || byEmail.googleId === g.googleId)) {
      user = byEmail;
    }
  }

  if (!user) {
    user = await User.create({
      email: normalizeEmail(g.email),
      googleId: g.googleId,
      name: g.name || undefined,
      profileImage: g.picture || undefined,
      role: "customer",
      status: "approved",
    });

    isNewUser = true;
  } else {
    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
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

  return res
    .status(isNewUser ? 201 : 200)
    .json(authResponse(user, { isNewUser }));
};

const handleAuthError = (res, name, error) => {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This account already exists. Please try again.",
    });
  }

  console.error(`${name} Error:`, error);

  return res.status(500).json({
    success: false,
    message: "Login failed",
  });
};

// --------------------------------------------------
// GOOGLE LOGIN
// --------------------------------------------------

exports.googleLogin = async (req, res) => {
  try {
    const g = await verifyGoogleIdToken(req.body?.idToken);

    if (!g.email || !g.googleId) {
      return res.status(401).json({
        success: false,
        message: "A valid Google identity is required",
      });
    }

    return await loginWithGoogleIdentity(res, g);
  } catch (error) {
    return handleAuthError(res, "Google Login", error);
  }
};

// --------------------------------------------------
// FIREBASE PHONE / GOOGLE LOGIN
// --------------------------------------------------

exports.firebaseLogin = async (req, res) => {
  try {
    const f = await verifyFirebaseIdToken(req.body?.idToken);

    if (f.provider === "google.com") {
      if (!f.email || !f.emailVerified) {
        return res.status(401).json({
          success: false,
          message: "Your Google account email is not verified",
        });
      }

      return await loginWithGoogleIdentity(res, {
        googleId: f.googleId || f.uid,
        email: f.email,
        name: f.name,
        picture: f.picture,
      });
    }

    if (f.provider !== "phone" || !f.phone) {
      return res.status(400).json({
        success: false,
        message: "Unsupported Firebase sign-in method",
      });
    }

    let user = await User.findOne({
      phone: { $in: phoneCandidates(f.phone) },
    });

    let isNewUser = false;

    if (!user) {
      user = await User.create({
        phone: canonicalPhone(f.phone),
        role: "customer",
        status: "approved",
      });

      isNewUser = true;
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
    }

    return res
      .status(isNewUser ? 201 : 200)
      .json(authResponse(user, { isNewUser }));
  } catch (error) {
    return handleAuthError(res, "Firebase Login", error);
  }
};

// --------------------------------------------------
// LINK VERIFIED PHONE TO EXISTING ACCOUNT
// --------------------------------------------------

exports.linkPhone = async (req, res) => {
  try {
    const f = await verifyFirebaseIdToken(req.body?.idToken);

    if (f.provider !== "phone" || !f.phone) {
      return res.status(400).json({
        success: false,
        message: "A Firebase phone verification token is required",
      });
    }

    const clash = await User.findOne({
      _id: { $ne: req.user._id },
      phone: { $in: phoneCandidates(f.phone) },
    });

    if (clash) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already used by another account",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.phone = canonicalPhone(f.phone);
    await user.save();

    return res.json({
      success: true,
      message: "Phone number verified and saved",
      user,
    });
  } catch (error) {
    return handleAuthError(res, "Link Phone", error);
  }
};

// --------------------------------------------------
// LINK GOOGLE TO EXISTING ACCOUNT
// --------------------------------------------------

exports.linkGoogle = async (req, res) => {
  try {
    const g = await verifyGoogleIdToken(req.body?.idToken);

    const clash = await User.findOne({
      _id: { $ne: req.user._id },
      $or: [
        { googleId: g.googleId },
        { email: emailRegex(g.email) },
      ],
    });

    if (clash) {
      return res.status(409).json({
        success: false,
        message: "This Google account is already used by another user",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.googleId = g.googleId;

    if (!user.email) user.email = normalizeEmail(g.email);
    if (!user.name && g.name) user.name = g.name;

    await user.save();

    return res.json({
      success: true,
      message: "Google account linked",
      user,
    });
  } catch (error) {
    return handleAuthError(res, "Link Google", error);
  }
};

// --------------------------------------------------
// EMAIL OTP — SEND
// --------------------------------------------------

exports.sendEmailOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[Email OTP] JWT_SECRET is not configured");

      return res.status(500).json({
        success: false,
        message: "Server authentication configuration is missing",
      });
    }

    if (!emailConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Email service is not configured",
      });
    }

    const now = Date.now();

    const existing = await Otp.findOne({
      email,
      $or: [
        { purpose: "email_verification" },
        { purpose: { $exists: false } },
      ],
    }).sort({ updatedAt: -1 });

    if (
      existing?.updatedAt &&
      now - new Date(existing.updatedAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      const seconds = Math.ceil(
        (RESEND_COOLDOWN_MS -
          (now - new Date(existing.updatedAt).getTime())) /
          1000
      );

      return res.status(429).json({
        success: false,
        message: `Please wait ${seconds} seconds before requesting another OTP`,
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    const expiresMinutes = Math.max(
      1,
      Number(process.env.OTP_EXPIRES_MINUTES || 5)
    );

    const expiresAt = new Date(now + expiresMinutes * 60 * 1000);

    await sendMail({
      to: email,
      subject: "Your Vaidic Sanskar verification code",
      text:
        `Your Vaidic Sanskar email verification code is ${otp}.\n\n` +
        `This code expires in ${expiresMinutes} minutes.\n` +
        "Do not share this code with anyone.",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2>Vaidic Sanskar</h2>
          <p>Your email verification code is:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 0">${otp}</div>
          <p>This code expires in ${expiresMinutes} minutes.</p>
          <p>Do not share this code with anyone.</p>
        </div>
      `,
    });

    await Otp.findOneAndUpdate(
      existing
        ? { _id: existing._id }
        : { email, purpose: "email_verification" },
      {
        $set: {
          email,
          purpose: "email_verification",
          otp: hashEmailOtp(email, otp),
          expiresAt,
          attempts: 0,
        },
        $unset: { phone: 1 },
      },
      {
        upsert: !existing,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "Verification code sent to your email",
      expiresInMinutes: expiresMinutes,
    });
  } catch (error) {
    console.error("[Email OTP Send]", error.message);

    return res.status(502).json({
      success: false,
      message:
        "Email could not be sent. Check SMTP configuration and server logs.",
    });
  }
};

// --------------------------------------------------
// EMAIL OTP — VERIFY / SIGNUP / LOGIN
// --------------------------------------------------

exports.verifyEmailOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "A valid email and six-digit OTP are required",
      });
    }

    const passwordInput = req.body?.password;

    // Missing password remains compatible with the old email-OTP flow.
    const password =
      passwordInput === undefined ||
      passwordInput === null ||
      passwordInput === ""
        ? undefined
        : passwordInput;

    const name = String(
      req.body?.name || req.body?.fullName || ""
    ).trim();

    if (password !== undefined && !validPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 128 characters",
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be 100 characters or fewer",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server authentication configuration is missing",
      });
    }

    const rec = await Otp.findOne({
      email,
      $or: [
        { purpose: "email_verification" },
        { purpose: { $exists: false } },
      ],
    }).sort({ updatedAt: -1 });

    if (!rec || !rec.expiresAt || rec.expiresAt <= new Date()) {
      if (rec) await Otp.deleteOne({ _id: rec._id });

      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: rec._id });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Request a new OTP.",
      });
    }

    const expected = hashEmailOtp(email, otp);
    const stored = String(rec.otp || "");

    const matches =
      /^[a-f0-9]{64}$/i.test(stored) &&
      crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(stored, "hex")
      );

    if (!matches) {
      rec.attempts = (rec.attempts || 0) + 1;
      await rec.save();

      const blocked = rec.attempts >= MAX_ATTEMPTS;

      if (blocked) {
        await Otp.deleteOne({ _id: rec._id });
      }

      return res.status(blocked ? 429 : 400).json({
        success: false,
        message: blocked
          ? "Too many attempts. Request a new OTP."
          : "Invalid or expired OTP",
        ...(blocked
          ? {}
          : { attemptsRemaining: MAX_ATTEMPTS - rec.attempts }),
      });
    }

    // Consume OTP before issuing a token.
    const consumed = await Otp.findOneAndDelete({
      _id: rec._id,
      email,
    });

    if (!consumed) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    let user = await User.findOne({
      email: emailRegex(email),
    }).select("+passwordHash");

    let isNewUser = false;

    const passwordHash = password
      ? await bcrypt.hash(password, 12)
      : undefined;

    if (!user) {
      user = await User.create({
        email,
        ...(name ? { name } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        role: "customer",
        status: "approved",
      });

      isNewUser = true;
    } else {
      if (user.status === "suspended") {
        return res.status(403).json({
          success: false,
          message: "Your account is suspended",
        });
      }

      let changed = false;

      if (!user.name && name) {
        user.name = name;
        changed = true;
      }

      // Do not overwrite an existing password.
      if (!user.passwordHash && passwordHash) {
        user.passwordHash = passwordHash;
        changed = true;
      }

      if (changed) await user.save();
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
    }

    return res
      .status(isNewUser ? 201 : 200)
      .json(
        authResponse(user, {
          isNewUser,
          emailVerified: true,
          passwordSet: Boolean(user.passwordHash),
        })
      );
  } catch (error) {
    console.error("[Email OTP Verify]", error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account already exists for this email",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to verify email OTP",
    });
  }
};
