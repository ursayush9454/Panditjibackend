const mongoose = require("mongoose");

const instantDispatchSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
    },

    // Time each Pandit gets to accept an offer
    offerTimeoutSeconds: {
      type: Number,
      default: 120, // 2 minutes per Pandit
      min: 30,
      max: 600,
    },

    // Maximum time to search for an eligible Pandit
    searchTimeoutSeconds: {
      type: Number,
      default: 3600, // keep searching up to 1 hour
      min: 30,
      max: 86400,
    },

    // Default search radius
    defaultRadiusKm: {
      type: Number,
      default: 5, // 5 km radius
      min: 1,
      max: 100,
    },

    // Minimum gap between "now" and the puja time (no immediate bookings)
    minAdvanceHours: {
      type: Number,
      default: 48,
      min: 0,
      max: 720,
    },

    // Pandit reminders start this many hours before the puja
    reminderStartHours: {
      type: Number,
      default: 2,
      min: 0.5,
      max: 24,
    },

    // ...and repeat at this interval until the Pandit marks arrival
    reminderIntervalMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 120,
    },

    // When true, premium status is used as a dispatch priority
    premiumFirst: {
      type: Boolean,
      default: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "InstantDispatchSettings",
  instantDispatchSettingsSchema
);