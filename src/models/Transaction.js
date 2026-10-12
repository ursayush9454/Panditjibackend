const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    consultation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
      default: null,
    },

    type: {
      type: String,
      enum: [
        "consultation_earning",
        "payout",
        "refund",
        "adjustment",
      ],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    direction: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    currency: {
      type: String,
      default: "INR",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Transaction", transactionSchema);