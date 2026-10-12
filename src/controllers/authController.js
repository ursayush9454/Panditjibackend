const crypto = require("crypto");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sign } = require("../utils/auth");
const { sendOtpSms } = require("../services/smsService");

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

exports.sendOtp = async (req, res) => {
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
