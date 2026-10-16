const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    distanceKm: {
      type: Number,
      default: 0,
    },

    offeredAt: {
      type: Date,
      default: Date.now,
    },

    respondedAt: {
      type: Date,
      default: null,
    },

    response: {
      type: String,
      enum: ["pending", "accepted", "declined", "timeout"],
      default: "pending",
    },
  },
  { _id: false }
);

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },

    // GeoJSON order: [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false }
);

const instantRequestSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    puja: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Puja",
      required: true,
    },

    pujaName: {
      type: String,
      default: "",
      trim: true,
    },

    withSamagri: {
      type: Boolean,
      default: false,
    },

    // The customer's scheduled puja date/time
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },

    // Set atomically when the one-hour arrival reminder is sent
    arrivalReminderSentAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Repeating reminders: first one 2h before, then every N minutes
    lastReminderAt: {
      type: Date,
      default: null,
    },

    reminderCount: {
      type: Number,
      default: 0,
    },

    pickup: {
      type: pointSchema,
      required: true,
    },

    address: {
      type: String,
      trim: true,
      required: true,
    },

    city: {
      type: String,
      trim: true,
      default: "",
    },

    pincode: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "wallet", "razorpay", "upi"],
      default: "cash",
    },

    // Fare is calculated on the server and saved at request time
    fare: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // "searching" is the internal status.
    // Customer API responses will display it as "processing".
    status: {
      type: String,
      enum: [
        "searching",
        "accepted",
        "arrived",
        "in_progress",
        "completed",
        "cancelled",
        "no_pandit",
      ],
      default: "searching",
      index: true,
    },

    radiusKm: {
      type: Number,
      default: 5,
      min: 1,
      max: 100,
    },

    candidates: {
      type: [candidateSchema],
      default: [],
    },

    currentOfferVendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },

    offerExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    searchExpiresAt: {
      type: Date,
      default: null,
    },

    assignedVendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
      index: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    arrivedAt: {
      type: Date,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    startOtpVerifiedAt: {
      type: Date,
      default: null,
    },

    // End OTP is hashed and never returned in normal API responses
    endOtpHash: {
      type: String,
      default: "",
      select: false,
    },

    endOtpExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },

    endOtpAttempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },

    endOtpVerifiedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: String,
      enum: ["customer", "pandit", "system", ""],
      default: "",
    },

    cancelReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

instantRequestSchema.index({ pickup: "2dsphere" });
instantRequestSchema.index({ status: 1, offerExpiresAt: 1 });
instantRequestSchema.index({ currentOfferVendor: 1, status: 1 });
instantRequestSchema.index({ status: 1, scheduledAt: 1, lastReminderAt: 1 });
instantRequestSchema.index({ assignedVendor: 1, status: 1, scheduledAt: 1 });

module.exports = mongoose.model("InstantRequest", instantRequestSchema);