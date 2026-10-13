const mongoose = require("mongoose");

const kitItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: String, default: "1", trim: true }, // e.g. "1 pkt", "250 g"
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },

    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    description: { type: String, trim: true, default: "" },

    // main image (kept for backward compatibility) + gallery
    image: { type: String, default: "" },
    images: [{ type: String }],

    // selling price (GST inclusive) and optional MRP for "x% off" display
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    gstPercent: { type: Number, default: 0, min: 0, max: 28 },

    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    maxPerOrder: { type: Number, default: 10, min: 1 },

    // legacy free-text category + proper category reference
    category: { type: String, trim: true, default: "" },
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null, index: true },

    sku: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "" }, // "pack", "set", "piece"
    weightGrams: { type: Number, default: 0, min: 0 },
    tags: [{ type: String, trim: true, lowercase: true }],

    // Puja kit / samagri bundle
    isKit: { type: Boolean, default: false },
    kitItems: { type: [kitItemSchema], default: [] },
    relatedPujas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Puja" }],

    isReturnable: { type: Boolean, default: false }, // consumables are non-returnable by default
    isFeatured: { type: Boolean, default: false, index: true },

    // admin moderation
    moderation: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true,
    },
    moderationNote: { type: String, default: "" },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ vendor: 1, createdAt: -1 });
productSchema.index({ isActive: 1, moderation: 1, categoryRef: 1 });
productSchema.index({ isActive: 1, moderation: 1, soldCount: -1 });

productSchema.virtual("discountPercent").get(function () {
  if (this.mrp > 0 && this.mrp > this.price) {
    return Math.round(((this.mrp - this.price) / this.mrp) * 100);
  }
  return 0;
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
