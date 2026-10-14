/**
 * OTP SMS sender. The original code never actually sent an SMS.
 * SMS_PROVIDER=msg91 (default) | console
 *   MSG91_AUTH_KEY, MSG91_TEMPLATE_ID   (DLT-approved template is mandatory in India)
 * Verify the request format against MSG91's current docs before going live.
 */
const axios = require("axios");

const sendOtpSms = async ({ phone, otp }) => {
  const provider = (process.env.SMS_PROVIDER || "console").toLowerCase();

  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMS provider is not configured");
    }
    console.log(`[DEV SMS] OTP for ${phone}: ${otp}`);
    return { provider: "console" };
  }

  if (provider === "msg91") {
    const authkey = process.env.MSG91_AUTH_KEY;
    const template = process.env.MSG91_TEMPLATE_ID;
    if (!authkey || !template) throw new Error("MSG91 is not configured");
    const digits = String(phone).replace(/\D/g, "");
    const mobile = digits.length === 10 ? `91${digits}` : digits;
    await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {},
      { params: { template_id: template, mobile, authkey, otp }, timeout: 15000 }
    );
    return { provider: "msg91" };
  }

  throw new Error(`Unknown SMS provider: ${provider}`);
};

module.exports = { sendOtpSms };
