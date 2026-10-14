const mongoose = require("mongoose");

const mandaliDispatchSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "default",
      unique: true,
      required: true,
    },
    priorityVendorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
      },
    ],
    radiusKm: {
      type: Number,
      default: 5,
      min: 5,
      max: 5,
    },
    offerTimeoutSeconds: {
      type: Number,
      default: 120,
      min: 120,
      max: 120,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.MandaliDispatchSettings ||
  mongoose.model(
    "MandaliDispatchSettings",
    mandaliDispatchSettingsSchema
  );
