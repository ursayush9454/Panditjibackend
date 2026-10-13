
const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    phone: {
      type: String,
      index: true,
      sparse: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      sparse: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", schema);
