const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    phone: { type: String, index: true },
    otp: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("Otp", schema);
