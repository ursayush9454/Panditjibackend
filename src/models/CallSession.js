const mongoose = require("mongoose");

const callSessionSchema = new mongoose.Schema(
  {
    // =====================================================
    // REFERENCES
    // =====================================================

    consultation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
      required: true,
      unique: true,
      index: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    // =====================================================
    // SESSION TYPE
    // =====================================================

    serviceType: {
      type: String,
      enum: ["chat", "audio", "video"],
      required: true,
    },

    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // =====================================================
    // RTC
    // =====================================================

    provider: {
      type: String,
      enum: [
        "none",
        "internal",
        "agora",
        "twilio",
        "daily",
        "webrtc",
        "other",
      ],
      default: "none",
    },

    // Do not store real long-lived RTC secrets here.
    providerSessionId: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // SESSION STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "created",
        "waiting",
        "connecting",
        "connected",
        "reconnecting",
        "ended",
        "failed",
        "timeout",
        "cancelled",
      ],
      default: "created",
      index: true,
    },

    // =====================================================
    // CONNECTION STATE
    // =====================================================

    customerConnected: {
      type: Boolean,
      default: false,
    },

    vendorConnected: {
      type: Boolean,
      default: false,
    },

    customerJoinedAt: {
      type: Date,
      default: null,
    },

    vendorJoinedAt: {
      type: Date,
      default: null,
    },

    customerLeftAt: {
      type: Date,
      default: null,
    },

    vendorLeftAt: {
      type: Date,
      default: null,
    },

    customerLastSeenAt: {
      type: Date,
      default: null,
    },

    vendorLastSeenAt: {
      type: Date,
      default: null,
    },

    customerReconnectCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    vendorReconnectCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // =====================================================
    // TIMING
    // =====================================================

    createdAtSession: {
      type: Date,
      default: Date.now,
    },

    connectedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    durationSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },

    durationMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    // =====================================================
    // END INFORMATION
    // =====================================================

    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    endReason: {
      type: String,
      enum: [
        "",
        "customer_ended",
        "vendor_ended",
        "system_ended",
        "network",
        "timeout",
        "completed",
        "cancelled",
        "failed",
        "other",
      ],
      default: "",
    },

    failureReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // =====================================================
    // NETWORK / QUALITY
    // =====================================================

    networkQualityCustomer: {
      type: String,
      enum: ["unknown", "excellent", "good", "fair", "poor"],
      default: "unknown",
    },

    networkQualityVendor: {
      type: String,
      enum: ["unknown", "excellent", "good", "fair", "poor"],
      default: "unknown",
    },

    lastHeartbeatAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // METADATA
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

callSessionSchema.index({
  customer: 1,
  createdAt: -1,
});

callSessionSchema.index({
  vendor: 1,
  createdAt: -1,
});

callSessionSchema.index({
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model("CallSession", callSessionSchema);