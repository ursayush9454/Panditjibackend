const mongoose = require("mongoose");

const deviceTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios", "web", "unknown"],
      default: "unknown",
    },
    deviceId: { type: String, default: "", trim: true },
    deviceName: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ token: 1 }, { unique: true });
deviceTokenSchema.index({ user: 1, isActive: 1 });

module.exports =
  mongoose.models.DeviceToken ||
  mongoose.model("DeviceToken", deviceTokenSchema);