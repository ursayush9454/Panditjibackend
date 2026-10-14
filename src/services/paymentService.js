const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const { creditWallet } = require("./walletService");
const { settleBookingEarning } = require("./earningService");

/**
 * Idempotent: safe to call from /verify AND from the webhook for the same payment.
 */
const markPaid = async ({ razorpayOrderId, razorpayPaymentId }) => {
  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId, status: "created" },
    { $set: { status: "paid", razorpayPaymentId, paidAt: new Date() } },
    { new: true }
  );

  if (!payment) {
    return { payment: await Payment.findOne({ razorpayOrderId }), alreadyProcessed: true };
  }

  if (payment.purpose === "wallet_topup") {
    await creditWallet({
      userId: payment.user,
      amount: payment.amount,
      category: "wallet_recharge",
      referenceId: `RZP-${razorpayPaymentId}`,
      description: "Wallet recharge",
      createdBy: null,
    });
  }

  if (payment.purpose === "booking" || payment.purpose === "mandali_advance") {
    const booking = await Booking.findById(payment.booking);
    if (booking) {
      if (payment.purpose === "mandali_advance" && payment.amount < booking.totalAmount) {
        booking.paymentStatus = "partial";
      } else {
        booking.paymentStatus = "paid";
      }
      if (payment.purpose === "mandali_advance" && booking.status === "pending") {
        booking.status = "confirmed";
        booking.confirmedAt = new Date();
      }
      booking.paymentMethod = "razorpay";
      booking.paymentId = razorpayPaymentId;
      booking.paymentOrderId = razorpayOrderId;
      booking.paidAt = new Date();
      await booking.save();

      if (booking.status === "completed" && booking.paymentStatus === "paid") {
        await settleBookingEarning(booking).catch((e) => console.error("settle after pay:", e));
      }
    }
  }

  if (payment.purpose === "daily_puja" && payment.subscription) {
    const { activateSubscription } = require("./dailyPujaService");
    await activateSubscription(payment.subscription, payment._id);
  }

  if (payment.purpose === "store_order" && payment.orderGroup) {
    const { onPaymentSuccess } = require("./storeService");
    await onPaymentSuccess(payment);
  }

  return { payment, alreadyProcessed: false };
};

const markFailed = async ({ razorpayOrderId, reason }) =>
  Payment.findOneAndUpdate(
    { razorpayOrderId, status: "created" },
    { $set: { status: "failed", failureReason: reason || "Payment failed" } },
    { new: true }
  );

module.exports = { markPaid, markFailed };
