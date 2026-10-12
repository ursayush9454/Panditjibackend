const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "puja",
        "pandit",
        "astrology",
        "merchant",
        "mandali",
        "other",
      ],
      default: "other",
    },

    title: {
      type: String,
      trim: true,
      required: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    scheduledAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "declined",
        "in_progress",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    declineReason: {
      type: String,
      trim: true,
      default: "",
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

jobSchema.index({
  vendor: 1,
  status: 1,
  createdAt: -1,
});

jobSchema.index({
  customer: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Job", jobSchema);