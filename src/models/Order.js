const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: "" },
    sku: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }, // unit selling price at purchase time
    mrp: { type: Number, default: 0, min: 0 },
    gstPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 }, // GST included in line total
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    by: { type: String, default: "system" }, // system | customer | merchant | admin
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ORDER_STATUSES = [
  "awaiting_payment",
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
];

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, sparse: true, index: true },
    // one checkout can create several orders (one per merchant) sharing a group id
    orderGroup: { type: String, index: true, default: null },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "Order must contain at least one item",
      },
    },

    // --- amounts (INR) ---
    subtotal: { type: Number, required: true, min: 0 }, // sum of item price * qty
    discountAmount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: "", uppercase: true, trim: true },
    couponFundedBy: { type: String, enum: ["platform", "vendor", ""], default: "" },
    shippingCharge: { type: Number, default: 0, min: 0 },
    codFee: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 }, // GST already included in prices
    totalAmount: { type: Number, required: true, min: 0 },

    advanceAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },

    // --- settlement ---
    commissionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    vendorAmount: { type: Number, default: 0, min: 0 },
    settled: { type: Boolean, default: false },

    status: { type: String, enum: ORDER_STATUSES, default: "pending", index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    paymentMethod: { type: String, enum: ["online", "cod"], default: "cod" },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid", "failed", "refunded", "partially_refunded"],
      default: "pending",
    },
    paymentId: { type: String, default: "" },
    paidAt: { type: Date, default: null },

    shippingAddress: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
      landmark: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      pincode: { type: String, trim: true, default: "" },
    },

    note: { type: String, default: "", trim: true },

    tracking: {
      courier: { type: String, default: "" },
      trackingId: { type: String, default: "" },
      trackingUrl: { type: String, default: "" },
      expectedDelivery: { type: Date, default: null },
      shippedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
    },

    // cancellation (top-level; the old schema nested this by mistake inside shippingAddress)
    cancelReason: { type: String, trim: true, default: "" },
    cancelledBy: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },

    // returns / replacements
    returnRequest: {
      reason: { type: String, default: "" },
      description: { type: String, default: "" },
      images: [{ type: String }],
      requestedAt: { type: Date, default: null },
      status: { type: String, enum: ["", "requested", "approved", "rejected"], default: "" },
      resolvedAt: { type: Date, default: null },
      adminNote: { type: String, default: "" },
    },

    refund: {
      amount: { type: Number, default: 0, min: 0 },
      refundId: { type: String, default: "" },
      status: { type: String, enum: ["", "pending", "processed", "failed"], default: "" },
      error: { type: String, default: "" },
      at: { type: Date, default: null },
    },

    stockRestored: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null }, // for awaiting_payment orders
  },
  { timestamps: true }
);

orderSchema.index({ vendor: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 });

orderSchema.statics.STATUSES = ORDER_STATUSES;

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
