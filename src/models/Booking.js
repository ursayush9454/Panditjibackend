const mongoose = require("mongoose");

const rescheduleHistorySchema =
  new mongoose.Schema(
    {
      oldSlot: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Slot",
        default: null,
      },

      newSlot: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Slot",
        default: null,
      },

      oldScheduledDate: {
        type: String,
        default: "",
      },

      oldStartTime: {
        type: String,
        default: "",
      },

      oldEndTime: {
        type: String,
        default: "",
      },

      newScheduledDate: {
        type: String,
        default: "",
      },

      newStartTime: {
        type: String,
        default: "",
      },

      newEndTime: {
        type: String,
        default: "",
      },

      reason: {
        type: String,
        trim: true,
        default: "",
      },

      requestedBy: {
        type: String,
        enum: [
          "customer",
          "vendor",
          "admin",
          "system",
        ],
        default: "customer",
      },

      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: true,
    }
  );

const cancellationSchema =
  new mongoose.Schema(
    {
      cancelledBy: {
        type: String,
        enum: [
          "customer",
          "vendor",
          "admin",
          "system",
        ],
        default: "customer",
      },

      reason: {
        type: String,
        trim: true,
        default: "",
      },

      cancelledAt: {
        type: Date,
        default: Date.now,
      },

      refundEligible: {
        type: Boolean,
        default: false,
      },

      refundAmount: {
        type: Number,
        min: 0,
        default: 0,
      },
    },
    {
      _id: false,
    }
  );

const bookingSchema =
  new mongoose.Schema(
    {
      // ==================================================
      // IDENTIFICATION
      // ==================================================

      bookingNumber: {
        type: String,
        unique: true,
        index: true,
      },

      // ==================================================
      // USERS
      // ==================================================

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

      // ==================================================
      // RELATED DATA
      // ==================================================

      slot: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Slot",
        default: null,
        index: true,
      },

      job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
        default: null,
        index: true,
      },

      consultation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Consultation",
        default: null,
        index: true,
      },

      conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        default: null,
        index: true,
      },

      // ==================================================
      // SERVICE
      // ==================================================

      serviceType: {
        type: String,
        enum: [
          "pandit",
          "astrology",
          "puja",
          "consultation",
          "merchant",
          "mandali",
          "chat",
          "audio",
          "video",
          "other",
        ],
        default: "other",
        index: true,
      },

      title: {
        type: String,
        trim: true,
        required: true,
      },

      description: {
        type: String,
        trim: true,
        default: "",
      },

      // ==================================================
      // PUJA
      // ==================================================

      puja: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Puja",
        default: null,
        index: true,
      },

      pujaName: {
        type: String,
        trim: true,
        default: "",
      },

      pujaCategory: {
        type: String,
        trim: true,
        default: "",
      },

      pujaBasePrice: {
        type: Number,
        min: 0,
        default: 0,
      },

      pujaDurationMinutes: {
        type: Number,
        min: 0,
        default: 0,
      },
    panditPujaService: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "PanditPujaService",
  default: null,
  index: true,
},

panditServicePrice: {
  type: Number,
  min: 0,
  default: 0,
},

panditServiceDurationMinutes: {
  type: Number,
  min: 0,
  default: 0,
},
      // ==================================================
      // SAMAGRI
      // ==================================================

      samagriOption: {
        type: String,
        enum: [
          "without_samagri",
          "with_samagri",
          "self_arranged",
        ],
        default: "without_samagri",
      },

      samagriIncluded: {
        type: Boolean,
        default: false,
      },

      samagriComboPrice: {
        type: Number,
        min: 0,
        default: 0,
      },

      samagriProducts: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            default: null,
          },

          name: {
            type: String,
            default: "",
          },

          quantity: {
            type: Number,
            min: 1,
            default: 1,
          },

          price: {
            type: Number,
            min: 0,
            default: 0,
          },

          image: {
            type: String,
            default: "",
          },
        },
      ],

      pujaTotal: {
        type: Number,
        min: 0,
        default: 0,
      },

      samagriTotal: {
        type: Number,
        min: 0,
        default: 0,
      },

      panditTotal: {
        type: Number,
        min: 0,
        default: 0,
      },

      // ==================================================
      // SCHEDULE
      // ==================================================

      scheduledDate: {
        type: String,
        trim: true,
        default: "",
        index: true,
      },

      startTime: {
        type: String,
        trim: true,
        default: "",
      },

      endTime: {
        type: String,
        trim: true,
        default: "",
      },

      timezone: {
        type: String,
        trim: true,
        default: "Asia/Kolkata",
      },

      // ==================================================
      // LOCATION
      // ==================================================

      address: {
        type: String,
        trim: true,
        default: "",
      },

      city: {
        type: String,
        trim: true,
        default: "",
      },

      state: {
        type: String,
        trim: true,
        default: "",
      },

      pincode: {
        type: String,
        trim: true,
        default: "",
      },

      latitude: {
        type: Number,
        default: null,
      },

      longitude: {
        type: Number,
        default: null,
      },

      // ==================================================
      // NOTES
      // ==================================================

      notes: {
        type: String,
        trim: true,
        default: "",
      },

      customerNotes: {
        type: String,
        trim: true,
        default: "",
      },

      vendorNotes: {
        type: String,
        trim: true,
        default: "",
      },

      adminNotes: {
        type: String,
        trim: true,
        default: "",
      },

      // ==================================================
      // PRICING
      // ==================================================

      amount: {
        type: Number,
        min: 0,
        default: 0,
      },

      baseAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      discountAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      couponCode: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      platformFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      taxAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      convenienceFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      refundAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      totalAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      vendorAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      commissionAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      commissionPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },

      // ==================================================
      // PAYMENT
      // ==================================================

      paymentMethod: {
        type: String,
        enum: [
          "cash",
          "upi",
          "card",
          "wallet",
          "netbanking",
          "razorpay",
          "stripe",
          "other",
        ],
        default: "other",
      },

      paymentStatus: {
        type: String,
        enum: [
          "pending",
          "processing",
          "partial",
          "paid",
          "failed",
          "cancelled",
          "refunded",
          "partially_refunded",
        ],
        default: "pending",
        index: true,
      },

      paymentId: {
        type: String,
        trim: true,
        default: "",
        index: true,
      },

      paymentOrderId: {
        type: String,
        trim: true,
        default: "",
      },

      transactionId: {
        type: String,
        trim: true,
        default: "",
        index: true,
      },

      paidAt: {
        type: Date,
        default: null,
      },

      refundedAt: {
        type: Date,
        default: null,
      },

      refundId: {
        type: String,
        trim: true,
        default: "",
      },

      // ==================================================
      // STATUS
      // ==================================================

      status: {
        type: String,
        enum: [
          "pending",
          "confirmed",
          "rescheduled",
          "in_progress",
          "completed",
          "cancelled",
          "rejected",
          "no_show",
        ],
        default: "pending",
        index: true,
      },

      rejectionReason: {
        type: String,
        trim: true,
        default: "",
      },

      rejectedAt: {
        type: Date,
        default: null,
      },

      // ==================================================
      // CANCELLATION
      // ==================================================

      cancellationReason: {
        type: String,
        trim: true,
        default: "",
      },

      cancellation: {
        type: cancellationSchema,
        default: null,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      // ==================================================
      // RESCHEDULE
      // ==================================================

      rescheduleReason: {
        type: String,
        trim: true,
        default: "",
      },

      rescheduledFrom: {
        scheduledDate: {
          type: String,
          default: "",
        },

        startTime: {
          type: String,
          default: "",
        },

        endTime: {
          type: String,
          default: "",
        },

        slot: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Slot",
          default: null,
        },
      },

      rescheduleHistory: {
        type: [rescheduleHistorySchema],
        default: [],
      },

      rescheduleCount: {
        type: Number,
        min: 0,
        default: 0,
      },

      // ==================================================
      // SERVICE OTP
      // ==================================================

      serviceOtp: {
        type: String,
        default: "",
        select: false,
      },

      serviceOtpExpiresAt: {
        type: Date,
        default: null,
        select: false,
      },

      serviceOtpAttempts: {
        type: Number,
        min: 0,
        default: 0,
        select: false,
      },

      serviceOtpVerified: {
        type: Boolean,
        default: false,
      },

      serviceOtpVerifiedAt: {
        type: Date,
        default: null,
      },

      // ==================================================
      // TIMESTAMPS
      // ==================================================

      confirmedAt: {
        type: Date,
        default: null,
      },

      startedAt: {
        type: Date,
        default: null,
      },

      completedAt: {
        type: Date,
        default: null,
      },

      noShowAt: {
        type: Date,
        default: null,
      },

      // ==================================================
      // REMINDERS
      // ==================================================

      reminder24hSent: {
        type: Boolean,
        default: false,
      },

      reminder1hSent: {
        type: Boolean,
        default: false,
      },

      // ==================================================
      // REVIEW
      // ==================================================

      reviewEligible: {
        type: Boolean,
        default: false,
      },

      reviewSubmitted: {
        type: Boolean,
        default: false,
      },

      review: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Review",
        default: null,
      },

      // ==================================================
      // SOURCE / META
      // ==================================================

      source: {
        type: String,
        enum: [
          "app",
          "website",
          "admin",
          "api",
          "system",
        ],
        default: "app",
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    {
      timestamps: true,
    }
  );

// ======================================================
// BOOKING NUMBER
// ======================================================

bookingSchema.pre(
  "validate",
  function (next) {
    if (!this.bookingNumber) {
      const timestamp =
        Date.now()
          .toString()
          .slice(-8);

      const random =
        Math.floor(
          1000 +
            Math.random() *
              9000
        );

      this.bookingNumber =
        `VS${timestamp}${random}`;
    }

    next();
  }
);

// ======================================================
// INDEXES
// ======================================================

bookingSchema.index({
  customer: 1,
  createdAt: -1,
});

bookingSchema.index({
  vendor: 1,
  createdAt: -1,
});

bookingSchema.index({
  vendor: 1,
  scheduledDate: 1,
  startTime: 1,
});

bookingSchema.index({
  status: 1,
  scheduledDate: 1,
});

bookingSchema.index({
  paymentStatus: 1,
  createdAt: -1,
});

bookingSchema.index({
  serviceType: 1,
  status: 1,
});

bookingSchema.index({
  customer: 1,
  status: 1,
});

bookingSchema.index({
  vendor: 1,
  status: 1,
});

bookingSchema.index({
  puja: 1,
  status: 1,
});

bookingSchema.index({
  customer: 1,
  puja: 1,
  createdAt: -1,
});

module.exports =
  mongoose.model(
    "Booking",
    bookingSchema
  );