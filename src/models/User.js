const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    // optional: accounts created with Google start without a phone until it is verified
    phone: { type: String, trim: true },
    name: String,
    email: String,
    googleId: { type: String },
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
  { timestamps: true, autoIndex: false },
);

// unique only when a phone exists. Created by config/db.js (ensureUserIndexes).
schema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);
schema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });
schema.index({ email: 1 });
module.exports = mongoose.model("User", schema);
