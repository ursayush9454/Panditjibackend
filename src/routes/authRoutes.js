
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

// Existing phone OTP endpoints.
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

// Email OTP endpoints.
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

// Google authentication.
r.post(
  "/google",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
  }),
  c.googleLogin
);

r.post("/google/link", auth, c.linkGoogle);

// Firebase phone / Google authentication.
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
