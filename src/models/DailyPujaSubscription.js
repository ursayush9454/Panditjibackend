const mongoose = require("mongoose");

/**
 * Daily puja subscription: a pandit performs a puja every day (or on chosen weekdays)
 * for N days. A Booking is auto-created for each upcoming day by dailyPujaService.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    puja: { type: mongoose.Schema.Types.ObjectId, ref: "Puja", required: true },
    pujaName: { type: String, default: "" },
    panditService: { type: mongoose.Schema.Types.ObjectId, ref: "PanditPujaService", default: null },

    // home = pandit comes to the customer; temple = pandit performs on the customer's behalf
    mode: { type: String, enum: ["home", "temple"], default: "home" },

    // sankalp details read out during the puja
    devoteeName: { type: String, trim: true, required: true },
    gotra: { type: String, trim: true, default: "" },
    sankalp: { type: String, trim: true, default: "" },

    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },

    timeOfDay: { type: String, required: true }, // "HH:mm"
    startDate: { type: String, required: true }, // YYYY-MM-DD
    weekdays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    skipDates: { type: [String], default: [] },

    planDays: { type: Number, required: true }, // number of pujas purchased
    pricePerDay: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    generatedDates: { type: [String], default: [] }, // dates for which a Booking exists
    completedCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["pending_payment", "active", "completed", "cancelled", "expired"],
      default: "pending_payment",
      index: true,
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    activatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
    refundedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

subscriptionSchema.index({ status: 1, startDate: 1 });

module.exports = mongoose.model("DailyPujaSubscription", subscriptionSchema);
