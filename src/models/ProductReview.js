const mongoose = require("mongoose");

const productReviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: "", trim: true, maxlength: 120 },
    comment: { type: String, default: "", trim: true, maxlength: 1500 },
    images: [{ type: String }],
    verifiedPurchase: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

productReviewSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports =
  mongoose.models.ProductReview || mongoose.model("ProductReview", productReviewSchema);
