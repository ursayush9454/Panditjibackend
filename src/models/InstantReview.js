const mongoose = require("mongoose");

const instantReviewSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InstantRequest",
      required: true,
      index: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    pandit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reviewerRole: {
      type: String,
      enum: ["customer", "pandit"],
      required: true,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    categories: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      enum: ["published", "hidden", "reported"],
      default: "published",
    },
  },
  {
    timestamps: true,
  }
);

// A customer and a Pandit can each submit only one review per request
instantReviewSchema.index(
  { request: 1, reviewerRole: 1 },
  { unique: true }
);

module.exports = mongoose.model("InstantReview", instantReviewSchema);