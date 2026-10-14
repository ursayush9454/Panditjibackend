
const r = require("express").Router();

const c = require("../controllers/authController");
const auth = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");

const phoneKey = (req) =>
  `${req.ip}:${String(req.body?.phone || "").slice(0, 16)}`;

const emailKey = (req) =>
  `${req.ip}:${String(req.body?.email || "")
    .trim()
    .toLowerCase()
    .slice(0, 100)}`;

// Email + password login
r.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyFn: emailKey,
    message: "Too many login attempts. Try again later.",
  }),
  c.login
);

// Forgot password
r.post(
  "/forgot-password",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyFn: emailKey,
    message: "Too many password-reset requests. Try again later.",
  }),
  c.forgotPassword
);

// Reset password using email OTP
r.post(
  "/reset-password",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyFn: emailKey,
    message: "Too many password-reset attempts. Try again later.",
  }),
  c.resetPassword
);

// Existing phone OTP routes
r.post(
  "/send-otp",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyFn: phoneKey,
    message: "Too many OTP requests. Try again later.",
  }),
  c.sendOtp
);

r.post(
  "/verify-otp",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    keyFn: phoneKey,
  }),
  c.verifyOtp
);

// Existing email OTP signup
r.post(
  "/email/send-otp",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyFn: emailKey,
    message: "Too many email OTP requests. Try again later.",
  }),
  c.sendEmailOtp
);

r.post(
  "/email/verify-otp",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    keyFn: emailKey,
  }),
  c.verifyEmailOtp
);

// Existing Google authentication
r.post(
  "/google",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
  }),
  c.googleLogin
);

r.post("/google/link", auth, c.linkGoogle);

// Existing Firebase authentication
r.post(
  "/firebase",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
  }),
  c.firebaseLogin
);

r.post(
  "/phone/link",
  auth,
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
  }),
  c.linkPhone
);

r.get("/me", auth, c.getMe);

module.exports = r;
