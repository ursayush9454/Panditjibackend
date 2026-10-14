
const mongoose = require("mongoose");

const mandaliDispatchSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, required: true },
    // Ordered list: vendors in this list are offered bookings first, in this order.
    // Vendors not listed are ordered by distance (nearest first).
    priorityVendorIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    ],
    radiusKm: { type: Number, default: 5, min: 5, max: 5 },
    offerTimeoutSeconds: { type: Number, default: 120, min: 120, max: 120 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MandaliDispatchSettings", mandaliDispatchSettingsSchema);