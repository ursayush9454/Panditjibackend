
const nodemailer = require("nodemailer");

let transporter;

const isConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

const getTransporter = () => {
  if (!isConfigured()) {
    throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS must be configured");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: String(process.env.SMTP_PASS).replace(/\s/g, ""),
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  return transporter;
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const sendMail = async ({ to, subject, text, html }) => {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    throw new Error("A valid recipient email is required");
  }

  const mailer = getTransporter();

  const result = await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: String(to).trim(),
    subject,
    text,
    html:
      html ||
      `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`,
  });

  console.log("[Email] SMTP accepted message:", result.messageId);

  return { sent: true, messageId: result.messageId };
};

const verifySmtpConnection = async () => {
  await getTransporter().verify();
  return true;
};

module.exports = {
  sendMail,
  configured: isConfigured,
  verifySmtpConnection,
};
