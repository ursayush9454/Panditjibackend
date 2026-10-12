const mongoose = require("mongoose");

const pujaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      default: "",
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    benefits: [
      {
        type: String,
        trim: true,
      },
    ],

    durationMinutes: {
      type: Number,
      default: 60,
      min: 1,
    },

    basePrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    category: {
      type: String,
      enum: [
        "daily",
        "festival",
        "marriage",
        "griha_pravesh",
        "havan",
        "shanti",
        "dosha",
        "special",
        "other",
      ],
      default: "other",
      index: true,
    },

    samagriAvailable: {
      type: Boolean,
      default: false,
    },

    samagriProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    samagriComboPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    samagriTitle: {
      type: String,
      default: "Puja Samagri Combo",
      trim: true,
    },

    samagriDescription: {
      type: String,
      default: "",
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    gallery: [
      {
        type: String,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    sortOrder: {
      type: Number,
      default: 0,
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

pujaSchema.index({
  category: 1,
  isActive: 1,
});

pujaSchema.index({
  name: "text",
  description: "text",
});

module.exports = mongoose.model("Puja", pujaSchema);