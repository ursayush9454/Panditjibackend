const mongoose = require("mongoose");

const consultationSchema = new mongoose.Schema(
  {
    // =====================================================
    // BASIC REFERENCES
    // =====================================================

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

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },

    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },

    // =====================================================
    // CONSULTATION NUMBER
    // =====================================================

    consultationNumber: {
      type: String,
      unique: true,
      index: true,
    },

    // =====================================================
    // SERVICE
    // =====================================================

    serviceType: {
      type: String,
      enum: ["chat", "audio", "video"],
      required: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    // =====================================================
    // STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "requested",
        "accepted",
        "rejected",
        "waiting",
        "active",
        "completed",
        "cancelled",
        "timeout",
        "no_show",
      ],
      default: "requested",
      index: true,
    },

    // =====================================================
    // RATES SNAPSHOT
    // =====================================================

    ratePerMinute: {
      type: Number,
      min: 0,
      default: 0,
    },

    rateCurrency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    // =====================================================
    // SESSION
    // =====================================================

    sessionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    roomId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    rtcProvider: {
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

    // =====================================================
    // TIMING
    // =====================================================

    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    waitingAt: {
      type: Date,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
      index: true,
    },

    endedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Actual connection duration
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

    billedMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    // =====================================================
    // BILLING
    // =====================================================

    grossAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    discountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    platformFee: {
      type: Number,
      min: 0,
      default: 0,
    },

    commissionPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 20,
    },

    commissionAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    vendorAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    customerAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    billingStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "calculated",
        "finalized",
        "failed",
      ],
      default: "not_started",
      index: true,
    },

    earning: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Earning",
      default: null,
      index: true,
    },

    // =====================================================
    // END / REJECTION / CANCELLATION
    // =====================================================

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    endReason: {
      type: String,
      enum: [
        "",
        "customer_ended",
        "vendor_ended",
        "system_ended",
        "timeout",
        "network",
        "completed",
        "cancelled",
        "no_show",
        "other",
      ],
      default: "",
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

    customerLastSeenAt: {
      type: Date,
      default: null,
    },

    vendorLastSeenAt: {
      type: Date,
      default: null,
    },

    customerDisconnectedAt: {
      type: Date,
      default: null,
    },

    vendorDisconnectedAt: {
      type: Date,
      default: null,
    },

    reconnectAttemptsCustomer: {
      type: Number,
      min: 0,
      default: 0,
    },

    reconnectAttemptsVendor: {
      type: Number,
      min: 0,
      default: 0,
    },

    // =====================================================
    // ACCEPTANCE TIMEOUT
    // =====================================================

    acceptanceExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    // =====================================================
    // METADATA
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

consultationSchema.index({
  customer: 1,
  createdAt: -1,
});

consultationSchema.index({
  vendor: 1,
  createdAt: -1,
});

consultationSchema.index({
  status: 1,
  serviceType: 1,
});

consultationSchema.index({
  booking: 1,
  createdAt: -1,
});

// =====================================================
// NUMBER GENERATOR
// =====================================================

consultationSchema.pre("save", function (next) {
  if (!this.consultationNumber) {
    const timestamp = Date.now();
    const random = Math.floor(1000 + Math.random() * 9000);

    this.consultationNumber = `VS-CONS-${timestamp}-${random}`;
  }

  if (
    !this.sessionId &&
    ["audio", "video", "chat"].includes(this.serviceType)
  ) {
    this.sessionId = `VS-SESSION-${Date.now()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
  }

  if (!this.roomId) {
    this.roomId = `VS-ROOM-${Date.now()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
  }

  next();
});

module.exports = mongoose.model("Consultation", consultationSchema);