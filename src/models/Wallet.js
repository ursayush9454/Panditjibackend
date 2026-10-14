const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalCredited: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalDebited: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalRefunded: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["active", "blocked", "suspended"],
      default: "active",
      index: true,
    },

    lastTransactionAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

walletSchema.index({
  user: 1,
  status: 1,
});

module.exports =
  mongoose.models.Wallet ||
  mongoose.model("Wallet", walletSchema);