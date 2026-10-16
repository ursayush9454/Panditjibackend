/**
 * One-time migration: old users have no password yet (they signed up by phone OTP or Google).
 * This emails each of them a password-reset code (Brevo first, SMTP fallback) so they can set a
 * password once and from then on log in with just email + password.
 *
 * Usage:
 *   node src/scripts/sendLegacyPasswordResets.js --dry-run        (only count, send nothing)
 *   node src/scripts/sendLegacyPasswordResets.js                  (send to everyone pending)
 *   node src/scripts/sendLegacyPasswordResets.js --limit=100 --delay-ms=700
 *   node src/scripts/sendLegacyPasswordResets.js --role=customer
 *
 * Safe to re-run: users who already set a password are skipped, and users who still hold an
 * unexpired reset code are skipped too (pass --force to send them a fresh one).
 * Users without an email are listed in the summary; they will be asked for an email in the app.
 */
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { issuePasswordResetOtp } = require("../services/passwordResetService");
const { configured } = require("../services/emailService");

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : true;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

(async () => {
  const dryRun = Boolean(arg("dry-run"));
  const force = Boolean(arg("force"));
  const limit = Number(arg("limit", 0)) || 0;
  const delayMs = Number(arg("delay-ms", 600));
  const role = arg("role", null);

  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in .env");
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing in .env");
    if (!dryRun && !configured()) {
      throw new Error("Neither Brevo nor SMTP is configured");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected", dryRun ? "(dry run)" : "");

    const filter = {
      $or: [{ passwordHash: { $exists: false } }, { passwordHash: null }, { passwordHash: "" }],
      status: { $ne: "suspended" },
    };
    if (role) filter.role = role;

    const users = await User.find(filter).select("+passwordHash email name role phone");

    const withEmail = users.filter((u) => u.email && validEmail(String(u.email).toLowerCase()));
    const noEmail = users.length - withEmail.length;

    console.log(`Users without a password: ${users.length}`);
    console.log(`  with email (can be mailed): ${withEmail.length}`);
    console.log(`  without email (cannot be mailed): ${noEmail}`);

    if (dryRun) {
      await mongoose.disconnect();
      return;
    }

    const stats = { sent: 0, skipped: 0, failed: 0 };
    const queue = limit ? withEmail.slice(0, limit) : withEmail;

    for (const user of queue) {
      const email = String(user.email).trim().toLowerCase();

      try {
        if (!force) {
          const active = await Otp.findOne({
            email,
            purpose: "password_reset",
            expiresAt: { $gt: new Date() },
          }).select("_id");

          if (active) {
            stats.skipped++;
            continue;
          }
        }

        await issuePasswordResetOtp(email, { kind: "legacy", ignoreCooldown: true });
        stats.sent++;
        console.log(`sent  ${email}`);
      } catch (error) {
        stats.failed++;
        console.error(`FAIL  ${email}: ${error.message}`);
      }

      await sleep(delayMs); // stay under provider rate limits
    }

    console.log("\nDone:", stats);
    await mongoose.disconnect();
  } catch (error) {
    console.error("Script failed:", error.message);
    process.exit(1);
  }
})();
