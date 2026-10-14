
const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
  {
    mandali: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    eventType: { type: String, trim: true, required: true },

    // Actual event instant; eventTime retains the local clock time.
    eventDate: { type: Date, required: true },
    eventTime: {
      type: String,
      trim: true,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },

    location: { type: String, trim: true, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    distanceKm: { type: Number, default: null },

    guestCount: { type: Number, default: 0, min: 0 },
    budget: { type: Number, default: 0, min: 0 },
    message: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: [
        "pending",
        "responded",
        "accepted",
        "rejected",
        "cancelled",
        "completed",
      ],
      default: "pending",
      index: true,
    },

    responseMessage: { type: String, trim: true, default: "" },
    quotedAmount: { type: Number, default: 0, min: 0 },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    advancePercent: {
      type: Number,
      default: 25,
      min: 0,
      max: 100,
    },

    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

inquirySchema.index({ mandali: 1, createdAt: -1 });
inquirySchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model("Inquiry", inquirySchema);
