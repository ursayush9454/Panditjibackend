const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    purpose: {
      type: String,
      enum: ["booking", "wallet_topup", "daily_puja", "mandali_advance", "store_order"],
      required: true,
    },

    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null, index: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "DailyPujaSubscription", default: null },
    // e-store: one payment can cover several merchant orders created in one checkout
    orderGroup: { type: String, default: null, index: true, sparse: true },

    amount: { type: Number, required: true, min: 1 }, // INR
    currency: { type: String, default: "INR" },

    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, default: null, index: true, sparse: true },

    status: {
      type: String,
      enum: ["created", "paid", "failed", "refunded", "partially_refunded"],
      default: "created",
      index: true,
    },

    refundId: { type: String, default: null },
    refundAmount: { type: Number, default: 0 },
    failureReason: { type: String, default: "" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
