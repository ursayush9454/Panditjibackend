/**
 * Minimal Razorpay client (REST + HMAC). No SDK dependency needed.
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 */
const axios = require("axios");
const crypto = require("crypto");

const BASE = "https://api.razorpay.com/v1";

const keys = () => {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) {
    const e = new Error("Payment gateway is not configured");
    e.status = 503;
    throw e;
  }
  return { id, secret };
};

const client = () => {
  const { id, secret } = keys();
  return axios.create({ baseURL: BASE, auth: { username: id, password: secret }, timeout: 20000 });
};

const wrap = async (fn) => {
  try {
    return (await fn()).data;
  } catch (err) {
    if (err.status) throw err;
    const e = new Error(err.response?.data?.error?.description || "Payment gateway error");
    e.status = err.response?.status && err.response.status < 500 ? 400 : 502;
    throw e;
  }
};

const createOrder = ({ amountInr, receipt, notes = {} }) =>
  wrap(() =>
    client().post("/orders", {
      amount: Math.round(amountInr * 100), // paise
      currency: "INR",
      receipt: String(receipt).slice(0, 40),
      notes,
    })
  );

const refundPayment = ({ paymentId, amountInr = null, notes = {} }) =>
  wrap(() =>
    client().post(`/payments/${paymentId}/refund`, {
      ...(amountInr ? { amount: Math.round(amountInr * 100) } : {}),
      notes,
    })
  );

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a || ""), "utf8");
  const B = Buffer.from(String(b || ""), "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// Checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret)
const verifyCheckoutSignature = ({ orderId, paymentId, signature }) => {
  const { secret } = keys();
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
};

// Webhook signature: HMAC_SHA256(raw_body, webhook_secret)
const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
};

module.exports = {
  keyId: () => keys().id,
  createOrder,
  refundPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
};
