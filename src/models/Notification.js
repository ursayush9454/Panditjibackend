const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "general",
        "system",
        "account",

        // Booking
        "booking_created",
        "booking_accepted",
        "booking_rejected",
        "booking_cancelled",
        "booking_rescheduled",
        "booking_started",
        "booking_completed",
        "booking_no_show",
        "mandali_booking_request",
        "mandali_booking_update",

        // Instant Puja Booking
        "instant_puja_reminder",
        "instant_request_update",

        // Chat
        "chat_message",

        // Consultation
        "consultation_request",
        "consultation_accepted",
        "consultation_rejected",
        "consultation_started",
        "consultation_completed",

        // Astrology
        "kundli_ready",
        "horoscope_ready",

        // Jobs
        "job_created",
        "job_accepted",
        "job_rejected",
        "job_started",
        "job_completed",
        "job_cancelled",

        // Orders
        "order_created",
        "order_confirmed",
        "order_shipped",
        "order_delivered",
        "order_cancelled",

        // Reviews
        "review_received",

        // Admin
        "admin_message",
        "admin_announcement",

        // Wallet and earnings
        "wallet_credit",
        "wallet_debit",
        "earning_created",

        // Profile
        "profile_approved",
        "profile_rejected",
        "profile_suspended",
      ],
      default: "general",
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },

    actionUrl: {
      type: String,
      default: "",
      trim: true,
    },

    actionType: {
      type: String,
      enum: [
        "",
        "open_booking",
        "open_chat",
        "open_consultation",
        "open_kundli",
        "open_horoscope",
        "open_order",
        "open_job",
        "open_wallet",
        "open_profile",
        "open_notification",
      ],
      default: "",
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    referenceType: {
      type: String,
      enum: [
        "",
        "Booking",
        "Inquiry",
        "Conversation",
        "Message",
        "Consultation",
        "Kundli",
        "Horoscope",
        "Order",
        "Job",
        "Wallet",
        "Earning",
        "Vendor",
        "Review",

        // Instant Puja
        "InstantRequest",
      ],
      default: "",
    },

    data: {
      type: Schema.Types.Mixed,
      default: {},
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    channels: {
      type: [
        {
          type: String,
          enum: ["in_app", "socket", "push", "email", "sms"],
        },
      ],
      default: ["in_app", "socket", "push"],
    },

    socketDelivered: {
      type: Boolean,
      default: false,
    },

    socketDeliveredAt: {
      type: Date,
      default: null,
    },

    pushDelivered: {
      type: Boolean,
      default: false,
    },

    pushDeliveredAt: {
      type: Date,
      default: null,
    },

    pushError: {
      type: String,
      default: "",
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isSystemGenerated: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Query indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 });

notificationSchema.methods.isExpired = function () {
  return Boolean(
    this.expiresAt && new Date() > this.expiresAt
  );
};

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
