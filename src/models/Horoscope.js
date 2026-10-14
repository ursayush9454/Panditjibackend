const mongoose = require("mongoose");

const horoscopeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    zodiacSign: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: [
        "aries",
        "taurus",
        "gemini",
        "cancer",
        "leo",
        "virgo",
        "libra",
        "scorpio",
        "sagittarius",
        "capricorn",
        "aquarius",
        "pisces",
      ],
    },
    date: {
      type: String,
      required: true,
    },
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly", "yearly"],
      default: "daily",
    },
    content: {
      overall: { type: String, default: "" },
      love: { type: String, default: "" },
      career: { type: String, default: "" },
      finance: { type: String, default: "" },
      health: { type: String, default: "" },
      family: { type: String, default: "" },
    },
    luckyNumber: {
      type: String,
      default: "",
    },
    luckyColor: {
      type: String,
      default: "",
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    provider: {
      type: String,
      default: "admin",
    },
  },
  { timestamps: true }
);

horoscopeSchema.index(
  { zodiacSign: 1, date: 1, period: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.Horoscope ||
  mongoose.model("Horoscope", horoscopeSchema);