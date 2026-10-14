const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    role: {
      type: String,
      enum: ["pandit", "astrologer", "merchant", "mandali"],
      required: true,
    },

    name: {
      type: String,
      trim: true,
      required: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
      required: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    bio: {
      type: String,
      trim: true,
      default: "",
    },

    experience: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Astrologer profile details shown to customers
    specializations: {
      type: [String],
      default: [],
    },

    languages: {
      type: [String],
      default: [],
    },

    // Astrologer consultation rates - INR per minute.
    // chatRate is the price the USER pays per minute. It is set by ADMIN only
    // (PUT /astro-chat/admin/astrologers/:id/pricing); astrologers cannot change it.
    chatRate: {
      type: Number,
      default: 20,
      min: 0,
    },

    audioRate: {
      type: Number,
      default: 30,
      min: 0,
    },

    videoRate: {
      type: Number,
      default: 40,
      min: 0,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "blocked"],
      default: "pending",
      index: true,
    },

    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Instant puja booking location: [longitude, latitude]
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },

    locationUpdatedAt: {
      type: Date,
      default: null,
    },

    // Maximum distance this Pandit accepts instant bookings from
    serviceRadiusKm: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
    },

    // Admin can enable/disable instant puja requests for this Pandit
    instantEligible: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Premium Pandits can be prioritized by dispatch settings
    isPremium: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Higher value means higher admin-assigned priority
    instantPriority: {
      type: Number,
      default: 0,
      min: 0,
      max: 1000,
    },

    // Prevents a Pandit from being assigned multiple active instant requests
    activeInstantRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InstantRequest",
      default: null,
    },

    // Per-vendor commission override
    commissionPercentage: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

vendorSchema.index({ location: "2dsphere" });
vendorSchema.index({ role: 1, status: 1, isOnline: 1 });
vendorSchema.index({
  role: 1,
  status: 1,
  isOnline: 1,
  instantEligible: 1,
});

module.exports = mongoose.model("Vendor", vendorSchema);