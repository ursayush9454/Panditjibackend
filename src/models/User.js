
const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    // Optional for Google/email accounts until phone verification.
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

// Existing phone uniqueness policy.
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

// Kept non-unique to avoid breaking existing databases.
// Check existing duplicate emails before adding a unique index.
schema.index({ email: 1 });

module.exports = mongoose.model("User", schema);
