
const axios = require("axios");

const isConfigured = () =>
  Boolean(
    process.env.BREVO_API_KEY &&
    process.env.BREVO_SENDER_EMAIL
  );

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendMail = async ({ to, subject, text, html }) => {
  if (!isConfigured()) {
    throw new Error(
      "BREVO_API_KEY and BREVO_SENDER_EMAIL must be configured"
    );
  }

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    throw new Error("A valid recipient email is required");
  }

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL.trim(),
          name: process.env.BREVO_SENDER_NAME || "Vaidic Sanskar",
        },
        to: [{ email: String(to).trim() }],
        subject,
        textContent: text || "",
        htmlContent:
          html ||
          `<pre style="font-family:Arial,sans-serif">${escapeHtml(text || "")}</pre>`,
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

    console.log("[Email] Brevo accepted message:", response.data.messageId);

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
