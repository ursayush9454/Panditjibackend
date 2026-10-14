const mongoose = require("mongoose");

const panditPujaServiceSchema = new mongoose.Schema(
  {
    // ======================================================
    // PANDIT
    // ======================================================

    pandit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    // ======================================================
    // PUJA
    // ======================================================

    puja: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Puja",
      required: true,
      index: true,
    },

    // ======================================================
    // SERVICE DETAILS
    // ======================================================

    title: {
      type: String,
      trim: true,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // Pandit's actual service price
    price: {
      type: Number,
      min: 0,
      required: true,
      default: 0,
    },

    // Optional separate puja price override
    pujaPrice: {
      type: Number,
      min: 0,
      default: null,
    },

    durationMinutes: {
      type: Number,
      min: 1,
      default: 60,
    },

    // ======================================================
    // SERVICE MODE
    // ======================================================

    serviceMode: {
      type: String,
      enum: [
        "offline",
        "online",
        "both",
      ],
      default: "offline",
      index: true,
    },

    // ======================================================
    // LOCATION
    // ======================================================

    homeService: {
      type: Boolean,
      default: true,
    },

    templeService: {
      type: Boolean,
      default: false,
    },

    panditLocation: {
      type: Boolean,
      default: false,
    },

    customerLocation: {
      type: Boolean,
      default: true,
    },

    // ======================================================
    // SAMAGRI
    // ======================================================

    samagriAvailable: {
      type: Boolean,
      default: false,
    },

    samagriIncluded: {
      type: Boolean,
      default: false,
    },

    samagriPrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ======================================================
    // REQUIREMENTS
    // ======================================================

    requirements: [
      {
        type: String,
        trim: true,
      },
    ],

    instructions: [
      {
        type: String,
        trim: true,
      },
    ],

    benefits: [
      {
        type: String,
        trim: true,
      },
    ],

    // ======================================================
    // AVAILABILITY
    // ======================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    // ======================================================
    // STATS
    // ======================================================

    totalBookings: {
      type: Number,
      min: 0,
      default: 0,
    },

    completedBookings: {
      type: Number,
      min: 0,
      default: 0,
    },

    cancelledBookings: {
      type: Number,
      min: 0,
      default: 0,
    },

    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },

    totalReviews: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ======================================================
    // ADMIN
    // ======================================================

    adminApproved: {
      type: Boolean,
      default: true,
      index: true,
    },

    adminNote: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// INDEXES
// ======================================================


panditPujaServiceSchema.index({
  pandit: 1,
  isActive: 1,
});

panditPujaServiceSchema.index({
  puja: 1,
  isActive: 1,
});

panditPujaServiceSchema.index({
  serviceMode: 1,
  isActive: 1,
});

// One Pandit should not add the same Puja twice.
panditPujaServiceSchema.index(
  {
    pandit: 1,
    puja: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "PanditPujaService",
  panditPujaServiceSchema
);