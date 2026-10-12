const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const rzp = require("../services/razorpayService");
const { markPaid, markFailed } = require("../services/paymentService");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error(`${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

const MIN_TOPUP = () => Number(process.env.MIN_TOPUP || 10);
const MAX_TOPUP = () => Number(process.env.MAX_TOPUP || 50000);

/**
 * POST /payments/orders
 * body: { purpose: "booking" | "wallet_topup" | "mandali_advance" | "daily_puja", bookingId?, subscriptionId?, amount? }
 * Amount for booking/subscription is ALWAYS computed on the server.
 */
exports.createOrder = handle("createOrder", async (req, res) => {
  const { purpose, bookingId, subscriptionId } = req.body;
  let amount;
  let booking = null;
  let subscription = null;

  if (purpose === "wallet_topup") {
    amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < MIN_TOPUP() || amount > MAX_TOPUP()) {
      return fail(res, 400, `Amount must be between ₹${MIN_TOPUP()} and ₹${MAX_TOPUP()}`);
    }
  } else if (purpose === "booking" || purpose === "mandali_advance") {
    if (!mongoose.isValidObjectId(bookingId)) return fail(res, 400, "Valid bookingId is required");
    booking = await Booking.findOne({ _id: bookingId, customer: req.user._id });
    if (!booking) return fail(res, 404, "Booking not found");
    if (["cancelled", "rejected", "no_show"].includes(booking.status)) {
      return fail(res, 409, "This booking cannot be paid");
    }
    if (booking.paymentStatus === "paid") return fail(res, 409, "Booking is already paid");

    if (purpose === "mandali_advance") {
      const pct = Number(booking.metadata?.advancePercent || process.env.MANDALI_ADVANCE_PERCENT || 25);
      amount = Math.round((booking.totalAmount * pct) / 100);
    } else {
      const paidAgg = await Payment.aggregate([
        { $match: { booking: booking._id, status: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      amount = Math.round((booking.totalAmount - (paidAgg[0]?.total || 0)) * 100) / 100;
    }
    if (!(amount > 0)) return fail(res, 400, "Nothing to pay for this booking");
  } else if (purpose === "daily_puja") {
    if (!mongoose.isValidObjectId(subscriptionId)) return fail(res, 400, "Valid subscriptionId is required");
    const DailyPujaSubscription = require("../models/DailyPujaSubscription");
    subscription = await DailyPujaSubscription.findOne({ _id: subscriptionId, customer: req.user._id });
    if (!subscription) return fail(res, 404, "Subscription not found");
    if (subscription.status !== "pending_payment") return fail(res, 409, "Subscription is not awaiting payment");
    amount = subscription.totalAmount;
  } else {
    return fail(res, 400, "Invalid purpose");
  }

  const order = await rzp.createOrder({
    amountInr: amount,
    receipt: `${purpose}-${(booking || subscription || req.user)._id}`.slice(0, 40),
    notes: { purpose, user: String(req.user._id) },
  });

  const payment = await Payment.create({
    user: req.user._id,
    purpose,
    booking: booking?._id || null,
    subscription: subscription?._id || null,
    amount,
    razorpayOrderId: order.id,
  });

  res.status(201).json({
    success: true,
    paymentId: payment._id,
    orderId: order.id,
    amount,
    amountPaise: order.amount,
    currency: order.currency,
    keyId: rzp.keyId(),
  });
});

/** POST /payments/verify  (called by the app after Razorpay checkout succeeds) */
exports.verify = handle("verify", async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!orderId || !paymentId || !signature) return fail(res, 400, "Missing payment details");

  const payment = await Payment.findOne({ razorpayOrderId: orderId, user: req.user._id });
  if (!payment) return fail(res, 404, "Payment not found");

  if (!rzp.verifyCheckoutSignature({ orderId, paymentId, signature })) {
    await markFailed({ razorpayOrderId: orderId, reason: "Signature mismatch" });
    return fail(res, 400, "Payment verification failed");
  }

  const result = await markPaid({ razorpayOrderId: orderId, razorpayPaymentId: paymentId });
  res.json({ success: true, message: "Payment verified", payment: result.payment });
});

/** POST /payments/webhook  (Razorpay -> server; needs the RAW body) */
exports.webhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!rzp.verifyWebhookSignature(req.rawBody, signature)) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body.event;
    const entity = req.body.payload?.payment?.entity;

    if ((event === "payment.captured" || event === "order.paid") && entity?.order_id) {
      await markPaid({ razorpayOrderId: entity.order_id, razorpayPaymentId: entity.id });
    } else if (event === "payment.failed" && entity?.order_id) {
      await markFailed({ razorpayOrderId: entity.order_id, reason: entity.error_description });
    }
    // Always 200 for valid signatures so Razorpay stops retrying
    return res.json({ success: true });
  } catch (e) {
    console.error("Razorpay webhook error:", e);
    return res.status(500).json({ success: false });
  }
};

exports.myPayments = handle("myPayments", async (req, res) => {
  const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, payments });
});

/** POST /payments/admin/refund  { paymentId, amount? } */
exports.adminRefund = handle("adminRefund", async (req, res) => {
  const payment = await Payment.findById(req.body.paymentId);
  if (!payment || !payment.razorpayPaymentId) return fail(res, 404, "Paid payment not found");
  if (!["paid", "partially_refunded"].includes(payment.status)) return fail(res, 409, "Payment is not refundable");

  const amount = req.body.amount ? Number(req.body.amount) : null;
  if (amount !== null && (!(amount > 0) || amount > payment.amount - payment.refundAmount)) {
    return fail(res, 400, "Invalid refund amount");
  }

  const refund = await rzp.refundPayment({
    paymentId: payment.razorpayPaymentId,
    amountInr: amount,
    notes: { by: String(req.user._id) },
  });

  const refunded = amount || payment.amount - payment.refundAmount;
  payment.refundId = refund.id;
  payment.refundAmount += refunded;
  payment.status = payment.refundAmount >= payment.amount ? "refunded" : "partially_refunded";
  await payment.save();

  if (payment.booking) {
    await Booking.updateOne(
      { _id: payment.booking },
      {
        $set: {
          paymentStatus: payment.status,
          refundId: refund.id,
          refundAmount: payment.refundAmount,
          refundedAt: new Date(),
        },
      }
    );
  }
  res.json({ success: true, refundId: refund.id, payment });
});
