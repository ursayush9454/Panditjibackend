/**
 * Transactional email (order updates). Uses nodemailer + the SMTP_* values in .env.
 * If SMTP is not configured (or nodemailer is not installed) emails are skipped silently,
 * so email can never break an order or booking.
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
let transporter = null;

const configured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (transporter) return transporter;
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (_) {
    return null; // run `npm install`
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * @returns {{sent:boolean, skipped?:string, error?:string}}  never throws
 */
const sendMail = async ({ to, subject, text }) => {
  try {
    if (!to || !/^\S+@\S+\.\S+$/.test(String(to))) return { sent: false, skipped: "no valid recipient" };
    if (!configured()) return { sent: false, skipped: "SMTP not configured" };
    const t = getTransporter();
    if (!t) return { sent: false, skipped: "nodemailer not installed" };

    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text).replace(/\n/g, "<br>")}<br><br>- Vaidic Sanskar</div>`,
    });
    return { sent: true };
  } catch (e) {
    console.error("[Email] send failed:", e.message);
    return { sent: false, error: e.message };
  }
};

module.exports = { sendMail, configured };
