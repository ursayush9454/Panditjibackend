const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
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

    consultation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
      default: null,
      index: true,
    },

    serviceType: {
      type: String,
      enum: [
        "chat",
        "audio",
        "video",
        "pandit",
        "merchant",
        "mandali",
        "booking",
        "other",
      ],
      default: "other",
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    categoryRatings: {
      communication: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },

      knowledge: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },

      behaviour: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },

      punctuality: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },

      serviceQuality: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },
    },

    status: {
      type: String,
      enum: [
        "pending",
        "published",
        "hidden",
        "rejected",
        "reported",
      ],
      default: "published",
      index: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    vendorReply: {
      text: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: "",
      },

      repliedAt: {
        type: Date,
        default: null,
      },
    },

    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    helpfulUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    reports: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },

        reason: {
          type: String,
          trim: true,
          maxlength: 500,
        },

        reportedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    adminNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    moderatedAt: {
      type: Date,
      default: null,
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

// =====================================================
// INDEXES
// =====================================================

reviewSchema.index({
  vendor: 1,
  status: 1,
  createdAt: -1,
});

reviewSchema.index({
  customer: 1,
  createdAt: -1,
});

reviewSchema.index({
  booking: 1,
});

reviewSchema.index({
  consultation: 1,
});

// One review per customer per booking
reviewSchema.index(
  {
    customer: 1,
    booking: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

module.exports =
  mongoose.model(
    "Review",
    reviewSchema
  );