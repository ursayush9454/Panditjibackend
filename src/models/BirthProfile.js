const mongoose = require("mongoose");

const birthProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "other",
    },
    dateOfBirth: {
      type: String,
      required: true,
      trim: true,
    },
    timeOfBirth: {
      type: String,
      required: true,
      trim: true,
    },
    birthPlace: {
      type: String,
      required: true,
      trim: true,
    },
    birthCity: {
      type: String,
      trim: true,
      default: "",
    },
    birthState: {
      type: String,
      trim: true,
      default: "",
    },
    birthCountry: {
      type: String,
      trim: true,
      default: "India",
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    photoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    photoReviewStatus: {
      type: String,
      enum: ["not_provided", "pending_review", "reviewed"],
      default: "not_provided",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    relation: {
      type: String,
      enum: [
        "self",
        "mother",
        "father",
        "spouse",
        "child",
        "sibling",
        "friend",
        "other",
      ],
      default: "self",
    },
  },
  {
    timestamps: true,
  }
);

birthProfileSchema.index({ user: 1, createdAt: -1 });

module.exports =
  mongoose.models.BirthProfile ||
  mongoose.model("BirthProfile", birthProfileSchema);