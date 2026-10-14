
const axios = require("axios");
const nodemailer = require("nodemailer");

let transporter;

const smtpConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

const brevoConfigured = () =>
  Boolean(
    process.env.BREVO_API_KEY &&
    process.env.BREVO_SENDER_EMAIL
  );

const isConfigured = () =>
  smtpConfigured() || brevoConfigured();

const truthy = (value) =>
  String(value || "").trim().toLowerCase() === "true";

const getTransporter = () => {
  if (!smtpConfigured()) {
    throw new Error(
      "SMTP_HOST, SMTP_USER and SMTP_PASS must be configured"
    );
  }

  if (!transporter) {
    const port = Number(
      process.env.SMTP_PORT ||
        (truthy(process.env.SMTP_SECURE) ? 465 : 587)
    );

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: truthy(process.env.SMTP_SECURE) || port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendMail = async ({ to, subject, text, html }) => {
  if (
    !to ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))
  ) {
    return {
      sent: false,
      skipped: true,
      reason: "invalid_recipient",
    };
  }

  if (!isConfigured()) {
    return {
      sent: false,
      skipped: true,
      reason: "email_not_configured",
    };
  }

  if (smtpConfigured()) {
    try {
      const info = await getTransporter().sendMail({
        from: {
          name:
            process.env.SMTP_FROM_NAME ||
            process.env.BREVO_SENDER_NAME ||
            "Vaidic Sanskar",
          address:
            process.env.SMTP_FROM_EMAIL ||
            process.env.SMTP_USER,
        },
        to: String(to).trim(),
        subject,
        text: text || "",
        html:
          html ||
          `<pre style="font-family:Arial,sans-serif">${escapeHtml(
            text || ""
          )}</pre>`,
      });

      console.log(
        "[Email] SMTP accepted message:",
        info.messageId || "sent"
      );

      return {
        sent: true,
        messageId: info.messageId || null,
      };
    } catch (error) {
      console.error("[Email] SMTP send failed:", error.message);

      if (!brevoConfigured()) {
        throw new Error(`SMTP email failed: ${error.message}`);
      }
    }
  }

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL.trim(),
          name:
            process.env.BREVO_SENDER_NAME || "Vaidic Sanskar",
        },
        to: [{ email: String(to).trim() }],
        subject,
        textContent: text || "",
        htmlContent:
          html ||
          `<pre style="font-family:Arial,sans-serif">${escapeHtml(
            text || ""
          )}</pre>`,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY.trim(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 20000,
      }
    );

    console.log(
      "[Email] Brevo accepted message:",
      response.data.messageId
    );

    return {
      sent: true,
      messageId: response.data.messageId,
    };
  } catch (error) {
    const details =
      error.response?.data?.message ||
      error.response?.data?.code ||
      error.message;

    console.error("[Email] Brevo send failed:", details);

    throw new Error(`Brevo email failed: ${details}`);
  }
};

module.exports = {
  sendMail,
  configured: isConfigured,
};
