const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
  {
    mandali: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      trim: true,
      required: true,
    },

    phone: {
      type: String,
      trim: true,
      required: true,
    },

    eventType: {
      type: String,
      trim: true,
      required: true,
    },

    eventDate: {
      type: Date,
      default: null,
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    guestCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    budget: {
      type: Number,
      default: 0,
      min: 0,
    },

    message: {
      type: String,
      trim: true,
      default: "",
    },

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
    },

    responseMessage: {
      type: String,
      trim: true,
      default: "",
    },

    quotedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

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

    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

inquirySchema.index({
  mandali: 1,
  createdAt: -1,
});

inquirySchema.index({
  customer: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "Inquiry",
  inquirySchema
);