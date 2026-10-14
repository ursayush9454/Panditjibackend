const mongoose = require("mongoose");
const crypto = require("crypto");

const { Schema } = mongoose;

const makeSessionNumber = () =>
  `AC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

const astroChatSessionSchema = new Schema(
  {
    sessionNumber: { type: String, unique: true, default: makeSessionNumber },

    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    astrologer: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    // astrologer's login user (wallet owner + socket room owner)
    astrologerUser: { type: Schema.Types.ObjectId, ref: "User", required: true },

    status: {
      type: String,
      enum: ["requested", "active", "ended", "rejected", "cancelled", "missed"],
      default: "requested",
      index: true,
    },

    requestedAt: { type: Date, default: Date.now },
    requestExpiresAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },

    endReason: {
      type: String,
      enum: [
        "",
        "customer_ended",
        "astrologer_ended",
        "low_balance",
        "disconnected",
        "system",
        "rejected",
        "cancelled",
        "expired",
      ],
      default: "",
    },
    endedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // ---- pricing SNAPSHOT (admin changes later do not affect a running chat) ----
    ratePerMinute: { type: Number, required: true, min: 0 }, // what the customer pays
    commissionPercent: { type: Number, required: true, min: 0, max: 100 },
    commissionPerMinute: { type: Number, required: true, min: 0 }, // admin keeps
    astrologerPerMinute: { type: Number, required: true, min: 0 }, // astrologer gets

    // ---- running totals ----
    billedMinutes: { type: Number, default: 0, min: 0 },
    totalCharged: { type: Number, default: 0, min: 0 },
    astrologerEarning: { type: Number, default: 0, min: 0 },
    adminCommission: { type: Number, default: 0, min: 0 },

    nextBillAt: { type: Date, default: null },

    // presence tracking: a chat is auto-ended if someone stays offline too long
    customerOfflineSince: { type: Date, default: null },
    astrologerOfflineSince: { type: Date, default: null },

    // Guards (partial unique indexes below):
    //  - a customer can have only ONE requested/active chat
    //  - an astrologer can have only ONE active chat
    liveForCustomer: { type: Boolean, default: true },
    liveForAstrologer: { type: Boolean, default: false },

    earning: { type: Schema.Types.ObjectId, ref: "Earning", default: null },

    // set when something needs manual admin attention (e.g. astrologer credit failed)
    billingIssue: { type: String, default: "" },
  },
  { timestamps: true }
);

astroChatSessionSchema.index(
  { customer: 1 },
  {
    unique: true,
    partialFilterExpression: { liveForCustomer: true },
    name: "one_live_chat_per_customer",
  }
);

astroChatSessionSchema.index(
  { astrologer: 1 },
  {
    unique: true,
    partialFilterExpression: { liveForAstrologer: true },
    name: "one_active_chat_per_astrologer",
  }
);

astroChatSessionSchema.index({ customer: 1, createdAt: -1 });
astroChatSessionSchema.index({ astrologerUser: 1, createdAt: -1 });
astroChatSessionSchema.index({ status: 1, nextBillAt: 1 });
astroChatSessionSchema.index({ status: 1, requestExpiresAt: 1 });

module.exports =
  mongoose.models.AstroChatSession ||
  mongoose.model("AstroChatSession", astroChatSessionSchema);
