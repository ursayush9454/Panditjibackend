/**
 * Admin e-store management: categories, coupons, product moderation, orders, returns, reports.
 * Mounted at /api/partner/store/admin (role: admin).
 */
const mongoose = require("mongoose");

const Category = require("../models/Category");
const Coupon = require("../models/Coupon");
const Product = require("../models/Product");
const Order = require("../models/Order");
const ProductReview = require("../models/ProductReview");

const store = require("../services/storeService");
const { sanitizeProductInput } = require("../services/productInput");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    if (e.code === 11000) return fail(res, 409, "A record with the same unique value already exists");
    if (e.name === "ValidationError") return fail(res, 400, e.message);
    console.error(`[StoreAdmin] ${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

const validId = (id) => mongoose.isValidObjectId(id);

const pageParams = (q, def = 20) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || def));
  return { page, limit, skip: (page - 1) * limit };
};

// =====================================================================
// CATEGORIES
// =====================================================================

exports.listCategories = handle("listCategories", async (req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ success: true, categories });
});

exports.createCategory = handle("createCategory", async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (name.length < 2) return fail(res, 400, "Category name is required");

  if (req.body.parent && !(validId(req.body.parent) && (await Category.exists({ _id: req.body.parent })))) {
    return fail(res, 400, "Parent category not found");
  }

  const category = await Category.create({
    name,
    slug: store.slugify(req.body.slug || name),
    description: String(req.body.description || "").trim(),
    image: String(req.body.image || ""),
    icon: String(req.body.icon || ""),
    parent: req.body.parent || null,
    sortOrder: Number(req.body.sortOrder) || 0,
    isActive: req.body.isActive !== false,
  });
  res.status(201).json({ success: true, category });
});

exports.updateCategory = handle("updateCategory", async (req, res) => {
  const category = validId(req.params.id) ? await Category.findById(req.params.id) : null;
  if (!category) return fail(res, 404, "Category not found");

  ["name", "description", "image", "icon"].forEach((k) => {
    if (req.body[k] !== undefined) category[k] = String(req.body[k]).trim();
  });
  if (req.body.slug !== undefined) category.slug = store.slugify(req.body.slug);
  if (req.body.sortOrder !== undefined) category.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) category.isActive = req.body.isActive === true;
  if (req.body.parent !== undefined) {
    if (String(req.body.parent) === String(category._id)) return fail(res, 400, "A category cannot be its own parent");
    category.parent = req.body.parent || null;
  }
  await category.save();
  res.json({ success: true, category });
});

exports.deleteCategory = handle("deleteCategory", async (req, res) => {
  const category = validId(req.params.id) ? await Category.findById(req.params.id) : null;
  if (!category) return fail(res, 404, "Category not found");

  const inUse = (await Product.exists({ categoryRef: category._id })) || (await Category.exists({ parent: category._id }));
  if (inUse) {
    category.isActive = false;
    await category.save();
    return res.json({ success: true, message: "Category is in use, so it was deactivated instead of deleted" });
  }
  await category.deleteOne();
  res.json({ success: true, message: "Category deleted" });
});

// =====================================================================
// COUPONS
// =====================================================================

const couponInput = (body, partial = false) => {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("code")) {
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw store.httpError(400, "Coupon code must be 3-20 letters/numbers");
    data.code = code;
  }
  if (!partial || has("type")) {
    if (!["percent", "flat"].includes(body.type)) throw store.httpError(400, "type must be percent or flat");
    data.type = body.type;
  }
  if (!partial || has("value")) {
    const v = Number(body.value);
    if (!(v > 0)) throw store.httpError(400, "Coupon value must be greater than 0");
    if ((data.type || body.type) === "percent" && v > 100) throw store.httpError(400, "Percent coupon cannot exceed 100");
    data.value = v;
  }
  ["maxDiscount", "minOrderAmount", "usageLimit", "perUserLimit"].forEach((k) => {
    if (has(k)) {
      const n = Number(body[k]);
      if (!Number.isFinite(n) || n < 0) throw store.httpError(400, `${k} must be 0 or more`);
      data[k] = n;
    }
  });
  if (has("description")) data.description = String(body.description || "").trim().slice(0, 200);
  if (has("validFrom")) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
  if (has("validTo")) data.validTo = body.validTo ? new Date(body.validTo) : null;
  if (data.validFrom && data.validTo && data.validTo < data.validFrom) {
    throw store.httpError(400, "validTo must be after validFrom");
  }
  if (has("firstOrderOnly")) data.firstOrderOnly = body.firstOrderOnly === true;
  if (has("fundedBy")) {
    if (!["platform", "vendor"].includes(body.fundedBy)) throw store.httpError(400, "fundedBy must be platform or vendor");
    data.fundedBy = body.fundedBy;
  }
  if (has("isActive")) data.isActive = body.isActive === true;
  return data;
};

exports.listCoupons = handle("listCoupons", async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, coupons });
});

exports.createCoupon = handle("createCoupon", async (req, res) => {
  const coupon = await Coupon.create(couponInput(req.body));
  res.status(201).json({ success: true, coupon });
});

exports.updateCoupon = handle("updateCoupon", async (req, res) => {
  const coupon = validId(req.params.id) ? await Coupon.findById(req.params.id) : null;
  if (!coupon) return fail(res, 404, "Coupon not found");
  Object.assign(coupon, couponInput({ type: coupon.type, ...req.body }, true));
  await coupon.save();
  res.json({ success: true, coupon });
});

exports.deleteCoupon = handle("deleteCoupon", async (req, res) => {
  const coupon = validId(req.params.id) ? await Coupon.findById(req.params.id) : null;
  if (!coupon) return fail(res, 404, "Coupon not found");
  if (coupon.usedCount > 0) {
    coupon.isActive = false;
    await coupon.save();
    return res.json({ success: true, message: "Coupon was already used, so it was deactivated instead of deleted" });
  }
  await coupon.deleteOne();
  res.json({ success: true, message: "Coupon deleted" });
});

// =====================================================================
// PRODUCTS (moderation)
// =====================================================================

exports.listProducts = handle("listProducts", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = {};
  if (req.query.moderation) filter.moderation = String(req.query.moderation);
  if (req.query.vendor && validId(req.query.vendor)) filter.vendor = req.query.vendor;
  if (req.query.active === "true") filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;
  if (req.query.q) filter.name = new RegExp(store.escapeRegex(String(req.query.q).trim()), "i");

  const [products, total] = await Promise.all([
    Product.find(filter).populate("vendor", "name city status").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), products });
});

/** PUT /store/admin/products/:id/moderate { action: approve|reject, note? } */
exports.moderateProduct = handle("moderateProduct", async (req, res) => {
  const product = validId(req.params.id) ? await Product.findById(req.params.id) : null;
  if (!product) return fail(res, 404, "Product not found");
  const { action, note } = req.body;
  if (!["approve", "reject"].includes(action)) return fail(res, 400, "action must be approve or reject");
  product.moderation = action === "approve" ? "approved" : "rejected";
  product.moderationNote = String(note || "").slice(0, 300);
  await product.save();
  res.json({ success: true, product });
});

/** Admin can edit any product field incl. featured flag */
exports.updateProduct = handle("adminUpdateProduct", async (req, res) => {
  const product = validId(req.params.id) ? await Product.findById(req.params.id) : null;
  if (!product) return fail(res, 404, "Product not found");

  const { data, errors } = sanitizeProductInput(req.body, { partial: true });
  if (errors.length) return fail(res, 400, errors[0]);
  if (req.body.isFeatured !== undefined) data.isFeatured = req.body.isFeatured === true;

  Object.assign(product, data);
  await product.save();
  res.json({ success: true, product });
});

exports.listReviews = handle("listReviews", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = {};
  if (req.query.hidden === "true") filter.isHidden = true;
  const [reviews, total] = await Promise.all([
    ProductReview.find(filter).populate("user", "name phone").populate("product", "name").sort({ createdAt: -1 }).skip(skip).limit(limit),
    ProductReview.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), reviews });
});

exports.moderateReview = handle("moderateReview", async (req, res) => {
  const review = validId(req.params.id) ? await ProductReview.findById(req.params.id) : null;
  if (!review) return fail(res, 404, "Review not found");
  review.isHidden = req.body.isHidden === true;
  await review.save();
  await store.recalcProductRating(review.product);
  res.json({ success: true, review });
});

// =====================================================================
// ORDERS
// =====================================================================

exports.listOrders = handle("listOrders", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.paymentStatus) filter.paymentStatus = String(req.query.paymentStatus);
  if (req.query.paymentMethod) filter.paymentMethod = String(req.query.paymentMethod);
  if (req.query.vendor && validId(req.query.vendor)) filter.vendor = req.query.vendor;
  if (req.query.customer && validId(req.query.customer)) filter.customer = req.query.customer;
  if (req.query.refundFailed === "true") filter["refund.status"] = "failed";
  if (req.query.unsettled === "true") Object.assign(filter, { status: "delivered", settled: false });
  if (req.query.q) filter.orderNumber = new RegExp(store.escapeRegex(String(req.query.q).trim()), "i");
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("customer", "name phone")
      .populate("vendor", "name city phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), orders });
});

const findOrder = async (id) =>
  validId(id) ? Order.findById(id).populate("customer", "name phone").populate("vendor", "name city phone user") : null;

exports.getOrder = handle("adminGetOrder", async (req, res) => {
  const order = await findOrder(req.params.id);
  if (!order) return fail(res, 404, "Order not found");
  res.json({ success: true, order });
});

/** PUT /store/admin/orders/:id/status { status, note?, courier?, trackingId? } - override, skips transition rules */
exports.forceOrderStatus = handle("forceOrderStatus", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return fail(res, 404, "Order not found");
  const { status } = req.body;
  if (!Order.STATUSES.includes(status)) return fail(res, 400, "Invalid status");
  if (["cancelled", "returned"].includes(order.status)) return fail(res, 400, `A ${order.status} order cannot be changed`);
  if (["return_requested", "awaiting_payment"].includes(status)) {
    return fail(res, 400, "Use the return / payment flows for that status");
  }
  const updated = await store.advanceOrder(order, status, { by: "admin", force: true, extra: req.body });
  res.json({ success: true, order: updated });
});

exports.cancelOrder = handle("adminCancelOrder", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return fail(res, 404, "Order not found");
  if (["delivered", "returned"].includes(order.status)) {
    return fail(res, 400, `A ${order.status} order cannot be cancelled. Use the return flow.`);
  }
  const updated = await store.cancelOrder(order, { by: "admin", reason: String(req.body.reason || "Cancelled by admin") });
  res.json({ success: true, order: updated });
});

/** PUT /store/admin/orders/:id/return { action: approve|reject, refundAmount?, note? } */
exports.resolveReturn = handle("resolveReturn", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return fail(res, 404, "Order not found");
  const updated = await store.resolveReturn(order, req.body);
  res.json({ success: true, order: updated });
});

/** Retry a failed refund or a failed vendor settlement */
exports.retryRefund = handle("retryRefund", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return fail(res, 404, "Order not found");
  if (order.refund?.status !== "failed") return fail(res, 400, "This order has no failed refund");
  const result = await store.refundOrder(order, order.refund.amount, "Admin retry");
  if (!result) return fail(res, 502, "Refund failed again. Check the payment gateway dashboard.");
  res.json({ success: true, refund: result });
});

exports.retrySettlement = handle("retrySettlement", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return fail(res, 404, "Order not found");
  if (order.status !== "delivered") return fail(res, 400, "Only delivered orders can be settled");
  if (order.settled) return fail(res, 409, "Order is already settled");
  const earning = await store.settleOrderEarning(order);
  res.json({ success: true, earning, settled: (await Order.findById(order._id)).settled });
});

// =====================================================================
// REPORTS
// =====================================================================

exports.getStats = handle("getStats", async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const since = new Date(Date.now() - days * 86400000);

  const live = { status: { $nin: ["awaiting_payment", "cancelled"] } };

  const [byStatus, sales, daily, topProducts, topVendors, lowStock, pendingProducts, refundFailed, unsettled] = await Promise.all([
    Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...live, createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          gmv: { $sum: "$totalAmount" },
          commission: { $sum: "$commissionAmount" },
          discounts: { $sum: "$discountAmount" },
          shipping: { $sum: "$shippingCharge" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...live, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, orders: { $sum: 1 }, gmv: { $sum: "$totalAmount" } } },
      { $sort: { _id: 1 } },
    ]),
    Product.find({ soldCount: { $gt: 0 } }).sort({ soldCount: -1 }).limit(10).select("name soldCount price vendor"),
    Order.aggregate([
      { $match: { status: "delivered", createdAt: { $gte: since } } },
      { $group: { _id: "$vendor", orders: { $sum: 1 }, sales: { $sum: "$subtotal" } } },
      { $sort: { sales: -1 } },
      { $limit: 10 },
      { $lookup: { from: "vendors", localField: "_id", foreignField: "_id", as: "vendor" } },
      { $project: { orders: 1, sales: 1, name: { $arrayElemAt: ["$vendor.name", 0] } } },
    ]),
    Product.countDocuments({ isActive: true, stock: { $lte: 5 } }),
    Product.countDocuments({ moderation: "pending" }),
    Order.countDocuments({ "refund.status": "failed" }),
    Order.countDocuments({ status: "delivered", settled: false }),
  ]);

  const statusCounts = {};
  byStatus.forEach((s) => (statusCounts[s._id] = s.count));

  res.json({
    success: true,
    periodDays: days,
    statusCounts,
    sales: sales[0] || { orders: 0, gmv: 0, commission: 0, discounts: 0, shipping: 0 },
    daily: daily.map((d) => ({ date: d._id, orders: d.orders, gmv: d.gmv })),
    topProducts,
    topVendors,
    attention: { lowStockProducts: lowStock, productsPendingApproval: pendingProducts, failedRefunds: refundFailed, unsettledOrders: unsettled },
  });
});
