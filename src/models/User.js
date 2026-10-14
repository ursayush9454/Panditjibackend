
const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    phone: {
      type: String,
      trim: true,
    },

    name: String,

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // Password ka bcrypt hash hi database mein save hoga.
    passwordHash: {
      type: String,
      select: false,
    },

    googleId: {
      type: String,
    },

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

    online: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, autoIndex: false }
);

schema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phone: { $type: "string" },
    },
  }
);

schema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      googleId: { $type: "string" },
    },
  }
);

schema.index({ email: 1 });

module.exports = mongoose.model("User", schema);
