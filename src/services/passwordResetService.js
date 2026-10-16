/**
 * Password-reset OTP: shared by
 *   - POST /auth/forgot-password
 *   - POST /auth/login (old accounts that never set a password)
 *   - scripts/sendLegacyPasswordResets.js (one-time bulk mail to old users)
 *
 * Email goes out through Brevo first and falls back to SMTP (see emailService).
 */
const crypto = require("crypto");
const Otp = require("../models/Otp");
const { sendMail } = require("./emailService");

const RESEND_COOLDOWN_MS = 30 * 1000;

// Reset codes live longer than normal login OTPs so people have time to open
// their inbox. Default 30 minutes; override with PASSWORD_RESET_OTP_EXPIRES_MINUTES.
const resetExpiryMinutes = () =>
  Math.max(
    1,
    Number(process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES || 30)
  );

const hashPasswordResetOtp = (email, otp) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`password-reset:${email}:${otp}`)
    .digest("hex");
};

const buildMail = ({ otp, minutes, kind }) => {
  const legacy = kind === "legacy";

  const subject = legacy
    ? "Set your new password for Vaidic Sanskar"
    : "Reset your Vaidic Sanskar password";

  const intro = legacy
    ? "We have upgraded login. You can now sign in with your email and password. " +
      "Please set your password once using the code below (Forgot Password / Reset Password screen in the app)."
    : "Use this code to reset your password:";

  const text =
    `${intro}\n\n` +
    `Your Vaidic Sanskar password-reset code is ${otp}.\n\n` +
    `This code is valid for ${minutes} minutes.\n` +
    "If you did not request this, you can ignore this email.";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
      <h2>Vaidic Sanskar</h2>
      <p>${intro}</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 0">
        ${otp}
      </div>
      <p>This code is valid for ${minutes} minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
};

/**
 * Creates a reset OTP and emails it.
 * Returns { sent: true } or { sent: false, reason: "cooldown" | "..." }.
 * Throws if the email could not be delivered by Brevo or SMTP.
 */
const issuePasswordResetOtp = async (
  email,
  { kind = "forgot", ignoreCooldown = false } = {}
) => {
  const now = Date.now();

  const existing = await Otp.findOne({
    email,
    purpose: "password_reset",
  });

  if (
    !ignoreCooldown &&
    existing?.updatedAt &&
    now - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return { sent: false, reason: "cooldown" };
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const minutes = resetExpiryMinutes();
  const expiresAt = new Date(now + minutes * 60 * 1000);

  // Save first, then send. If delivery fails the code is removed again.
  const record = await Otp.findOneAndUpdate(
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
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  try {
    const result = await sendMail({
      to: email,
      ...buildMail({ otp, minutes, kind }),
    });

    if (!result?.sent) {
      throw new Error(result?.reason || "email_not_sent");
    }

    return { sent: true, provider: result.provider, expiresAt };
  } catch (error) {
    await Otp.deleteOne({ _id: record._id });
    throw error;
  }
};

module.exports = {
  RESEND_COOLDOWN_MS,
  resetExpiryMinutes,
  hashPasswordResetOtp,
  issuePasswordResetOtp,
};
