const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "credit",
        "debit",
        "hold",
        "release",
        "refund",
        "adjustment",
      ],
      required: true,
      index: true,
    },

    category: {
      type: String,
      enum: [
        "wallet_recharge",
        "consultation",
        "booking",
        "commission",
        "refund",
        "cashback",
        "adjustment",
        "earning",
        "other",
      ],
      default: "other",
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    lockedBalanceBefore: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedBalanceAfter: {
      type: Number,
      default: 0,
      min: 0,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },

    earning: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Earning",
      default: null,
    },

    referenceId: {
      type: String,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "completed",
        "failed",
        "reversed",
      ],
      default: "completed",
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

walletTransactionSchema.index({
  user: 1,
  createdAt: -1,
});

walletTransactionSchema.index({
  wallet: 1,
  createdAt: -1,
});

walletTransactionSchema.index({
  category: 1,
  createdAt: -1,
});

walletTransactionSchema.index(
  {
    referenceId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

module.exports =
  mongoose.models.WalletTransaction ||
  mongoose.model(
    "WalletTransaction",
    walletTransactionSchema
  );