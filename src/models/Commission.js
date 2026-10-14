const mongoose = require("mongoose");

const commissionSchema = new mongoose.Schema(
  {
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
      required: true,
      unique: true,
      index: true,
    },

    percentage: {
      type: Number,
      default: 20,
      min: 0,
      max: 100,
    },

    fixedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    vendorPercentage: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Commission ||
  mongoose.model("Commission", commissionSchema);