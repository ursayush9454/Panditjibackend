const mongoose = require("mongoose");

const earningSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },

    consultation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
      default: null,
    },

    serviceType: {
      type: String,
      enum: [
        "chat",
        "audio",
        "video",
        "pandit",
        "merchant",
        "mandali",
        "booking",
        "other",
      ],
      default: "other",
      index: true,
    },

    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    ratePerMinute: {
      type: Number,
      default: 0,
      min: 0,
    },

    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    commissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    commissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    netAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "available",
        "credited",
        "reversed",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    transactionReference: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    earnedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    creditedAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    reversalReason: {
      type: String,
      default: "",
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

earningSchema.index({
  vendor: 1,
  createdAt: -1,
});

earningSchema.index({
  user: 1,
  createdAt: -1,
});

earningSchema.index({
  status: 1,
  createdAt: -1,
});

earningSchema.index({
  serviceType: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.Earning ||
  mongoose.model("Earning", earningSchema);