const mongoose = require("mongoose");

const personSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    birthProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BirthProfile",
      default: null,
    },
    photoUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const kundliMatchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bride: {
      type: personSchema,
      required: true,
    },
    groom: {
      type: personSchema,
      required: true,
    },
    totalScore: {
      type: Number,
      min: 0,
      max: 36,
      default: 0,
    },
    maximumScore: {
      type: Number,
      default: 36,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    provider: {
      type: String,
      default: "navamsha",
    },
  },
  { timestamps: true }
);

kundliMatchSchema.index({ user: 1, createdAt: -1 });

module.exports =
  mongoose.models.KundliMatch ||
  mongoose.model("KundliMatch", kundliMatchSchema);