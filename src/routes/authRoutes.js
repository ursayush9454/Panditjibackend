const r = require("express").Router();
const c = require("../controllers/authController");
const auth = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");

const phoneKey = (req) => `${req.ip}:${String(req.body?.phone || "").slice(0, 16)}`;

r.post(
  "/send-otp",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5, keyFn: phoneKey, message: "Too many OTP requests. Try again later." }),
  c.sendOtp
);
r.post(
  "/verify-otp",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 15, keyFn: phoneKey }),
  c.verifyOtp
);
r.get("/me", auth, c.getMe);

module.exports = r;
