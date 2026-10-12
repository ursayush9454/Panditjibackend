const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: String,
    email: String,
    role: {
      type: String,
      enum: [
        "pandit",
        "astrologer",
        "merchant",
        "mandali",
        "customer",
        "admin",
      ],
      default: "customer",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    profileImage: String,
    online: { type: Boolean, default: false },
  },
  { timestamps: true },
);
module.exports = mongoose.model("User", schema);
