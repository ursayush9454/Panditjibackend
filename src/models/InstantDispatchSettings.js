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
      default: 120,
      min: 30,
      max: 600,
    },

    // Maximum time to search for an eligible Pandit
    searchTimeoutSeconds: {
      type: Number,
      default: 180,
      min: 30,
      max: 1800,
    },

    // Default search radius
    defaultRadiusKm: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
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