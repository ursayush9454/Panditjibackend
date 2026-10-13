/**
 * Merchant (shop owner) panel: product catalogue, stock, orders, dashboard.
 * Routes are mounted under /api/partner/merchant and require role "merchant".
 */
const mongoose = require("mongoose");

const Vendor = require("../models/Vendor");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Order = require("../models/Order");

const store = require("../services/storeService");
const { sanitizeProductInput } = require("../services/productInput");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    if (e.name === "ValidationError") return fail(res, 400, e.message);
    console.error(`[Merchant] ${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

const validId = (id) => mongoose.isValidObjectId(id);

const getVendor = (req) => Vendor.findOne({ user: req.user.id, role: "merchant" });

/** loads the merchant or sends the error response; returns null when a response was sent */
const requireVendor = async (req, res, { approved = false } = {}) => {
  const vendor = await getVendor(req);
  if (!vendor) {
    fail(res, 404, "Merchant profile not found");
    return null;
  }
  if (approved && vendor.status !== "approved") {
    fail(res, 403, "Merchant is not approved");
    return null;
  }
  return vendor;
};

const pageParams = (q, def = 20) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || def));
  return { page, limit, skip: (page - 1) * limit };
};

// =====================================================================
// PRODUCTS
// =====================================================================

const applyCategory = async (data) => {
  if (data.categoryRef) {
    const cat = await Category.findOne({ _id: data.categoryRef, isActive: true });
    if (!cat) throw store.httpError(400, "Selected category does not exist");
    if (!data.category) data.category = cat.name;
  }
};

exports.createProduct = handle("createProduct", async (req, res) => {
  const vendor = await requireVendor(req, res, { approved: true });
  if (!vendor) return;

  const { data, errors } = sanitizeProductInput(req.body);
  if (errors.length) return fail(res, 400, errors[0]);
  await applyCategory(data);

  if (data.image && !data.images) data.images = [data.image];
  if (!data.image && data.images?.length) data.image = data.images[0];

  const product = await Product.create({
    ...data,
    vendor: vendor._id,
    slug: store.uniqueSlug(data.name),
    moderation: store.config().productApproval ? "pending" : "approved",
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  res.status(201).json({
    success: true,
    message: product.moderation === "pending" ? "Product submitted for admin approval" : "Product created successfully",
    product,
  });
});

exports.getProducts = handle("getProducts", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const { page, limit, skip } = pageParams(req.query);
  const filter = { vendor: vendor._id };
  if (req.query.active === "true") filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;
  if (req.query.moderation) filter.moderation = String(req.query.moderation);
  if (req.query.lowStock === "true") filter.$expr = { $lte: ["$stock", "$lowStockThreshold"] };
  if (req.query.q) filter.name = new RegExp(store.escapeRegex(String(req.query.q).trim()), "i");

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({ success: true, count: products.length, total, page, pages: Math.ceil(total / limit), products });
});

exports.getProduct = handle("getProduct", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;
  const product = validId(req.params.id) ? await Product.findOne({ _id: req.params.id, vendor: vendor._id }) : null;
  if (!product) return fail(res, 404, "Product not found");
  res.json({ success: true, product });
});

exports.updateProduct = handle("updateProduct", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const product = validId(req.params.id) ? await Product.findOne({ _id: req.params.id, vendor: vendor._id }) : null;
  if (!product) return fail(res, 404, "Product not found");

  const { data, errors } = sanitizeProductInput(req.body, { partial: true });
  if (errors.length) return fail(res, 400, errors[0]);
  await applyCategory(data);

  // MRP check against the stored price when only one of them is sent
  const price = data.price !== undefined ? data.price : product.price;
  const mrp = data.mrp !== undefined ? data.mrp : product.mrp;
  if (mrp > 0 && mrp < price) return fail(res, 400, "MRP cannot be lower than the selling price");

  if (data.images && !data.image) data.image = data.images[0] || "";

  const contentChanged = ["name", "description", "image", "images"].some(
    (k) => data[k] !== undefined && JSON.stringify(data[k]) !== JSON.stringify(product[k])
  );
  Object.assign(product, data);
  if (store.config().productApproval && contentChanged) product.moderation = "pending";

  await product.save();
  res.json({ success: true, message: "Product updated successfully", product });
});

exports.deleteProduct = handle("deleteProduct", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;
  const product = validId(req.params.id) ? await Product.findOne({ _id: req.params.id, vendor: vendor._id }) : null;
  if (!product) return fail(res, 404, "Product not found");
  product.isActive = false;
  await product.save();
  res.json({ success: true, message: "Product deactivated successfully", product });
});

/** PUT /merchant/products/stock  { updates: [{ productId, stock }] }  - quick inventory update */
exports.bulkUpdateStock = handle("bulkUpdateStock", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const updates = req.body.updates;
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 200) {
    return fail(res, 400, "updates must be a list of 1-200 items");
  }
  for (const u of updates) {
    if (!validId(u.productId) || !Number.isInteger(Number(u.stock)) || Number(u.stock) < 0) {
      return fail(res, 400, "Each update needs a valid productId and a whole-number stock (0 or more)");
    }
  }

  const result = await Product.bulkWrite(
    updates.map((u) => ({
      updateOne: { filter: { _id: u.productId, vendor: vendor._id }, update: { $set: { stock: Number(u.stock) } } },
    }))
  );
  res.json({ success: true, message: "Stock updated", matched: result.matchedCount, modified: result.modifiedCount });
});

// =====================================================================
// ORDERS
// =====================================================================

exports.getOrders = handle("getOrders", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const { page, limit, skip } = pageParams(req.query);
  // unpaid online checkouts are not the merchant's business yet
  const filter = { vendor: vendor._id, status: { $ne: "awaiting_payment" } };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.paymentMethod) filter.paymentMethod = String(req.query.paymentMethod);
  if (req.query.q) filter.orderNumber = new RegExp(store.escapeRegex(String(req.query.q).trim()), "i");
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("customer", "name phone")
      .populate("items.product", "name image price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  res.json({ success: true, count: orders.length, total, page, pages: Math.ceil(total / limit), orders });
});

exports.getOrder = handle("getOrder", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;
  const order = validId(req.params.id)
    ? await Order.findOne({ _id: req.params.id, vendor: vendor._id, status: { $ne: "awaiting_payment" } })
        .populate("customer", "name phone")
        .populate("items.product", "name image price")
    : null;
  if (!order) return fail(res, 404, "Order not found");
  res.json({ success: true, order });
});

/**
 * PUT /merchant/orders/:id/status
 * body: { status, courier?, trackingId?, trackingUrl?, expectedDelivery?, note? }
 * Allowed flow: pending -> confirmed -> processing -> shipped -> out_for_delivery -> delivered  (cancel before shipping)
 */
exports.updateOrderStatus = handle("updateOrderStatus", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const { status } = req.body;
  if (!Order.STATUSES.includes(status)) return fail(res, 400, "Invalid order status");

  const order = validId(req.params.id) ? await Order.findOne({ _id: req.params.id, vendor: vendor._id }) : null;
  if (!order) return fail(res, 404, "Order not found");

  if (order.status === "awaiting_payment") return fail(res, 400, "Customer has not completed the payment yet");
  if (["delivered", "cancelled", "returned", "return_requested"].includes(order.status)) {
    return fail(res, 400, `A ${order.status.replace("_", " ")} order cannot be updated`);
  }

  const updated = await store.advanceOrder(order, status, { by: "merchant", extra: req.body });
  res.json({ success: true, message: "Order status updated successfully", order: updated });
});

/** Legacy endpoint: merchant records an advance collected offline. Online-paid orders are managed by the gateway. */
exports.updateOrderAdvance = handle("updateOrderAdvance", async (req, res) => {
  const { orderId, advanceAmount } = req.body;
  if (!validId(orderId) || advanceAmount === undefined) return fail(res, 400, "Order ID and advance amount are required");

  const advance = Number(advanceAmount);
  if (!Number.isFinite(advance) || advance < 0) return fail(res, 400, "Invalid advance amount");

  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const order = await Order.findOne({ _id: orderId, vendor: vendor._id });
  if (!order) return fail(res, 404, "Order not found");
  if (order.paymentMethod === "online") return fail(res, 400, "Online payments are tracked automatically");
  if (["cancelled", "awaiting_payment", "returned"].includes(order.status)) {
    return fail(res, 400, `Cannot change payment of a ${order.status} order`);
  }
  if (advance > order.totalAmount) return fail(res, 400, "Advance cannot exceed total order amount");

  order.advanceAmount = advance;
  order.remainingAmount = order.totalAmount - advance;
  order.paymentStatus = order.remainingAmount === 0 ? "paid" : advance > 0 ? "partial" : "pending";
  await order.save();

  res.json({ success: true, message: "Order advance updated successfully", order });
});

// =====================================================================
// DASHBOARD
// =====================================================================

exports.getDashboard = handle("getDashboard", async (req, res) => {
  const vendor = await requireVendor(req, res);
  if (!vendor) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

  const base = { vendor: vendor._id, status: { $ne: "awaiting_payment" } };

  const [statusAgg, todayCount, monthAgg, lifetimeAgg, lowStock, outOfStock, topProducts, productTotals] = await Promise.all([
    Order.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Order.countDocuments({ ...base, createdAt: { $gte: startOfDay } }),
    Order.aggregate([
      { $match: { vendor: vendor._id, status: "delivered", "tracking.deliveredAt": { $gte: startOfMonth } } },
      { $group: { _id: null, orders: { $sum: 1 }, earnings: { $sum: "$vendorAmount" }, sales: { $sum: "$subtotal" } } },
    ]),
    Order.aggregate([
      { $match: { vendor: vendor._id, status: "delivered" } },
      { $group: { _id: null, orders: { $sum: 1 }, earnings: { $sum: "$vendorAmount" }, sales: { $sum: "$subtotal" } } },
    ]),
    Product.find({ vendor: vendor._id, isActive: true, stock: { $gt: 0 }, $expr: { $lte: ["$stock", "$lowStockThreshold"] } })
      .select("name image stock lowStockThreshold")
      .limit(10),
    Product.countDocuments({ vendor: vendor._id, isActive: true, stock: 0 }),
    Product.find({ vendor: vendor._id }).sort({ soldCount: -1 }).limit(5).select("name image soldCount price stock"),
    Product.aggregate([
      { $match: { vendor: vendor._id } },
      { $group: { _id: "$moderation", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = {};
  statusAgg.forEach((s) => (statusCounts[s._id] = s.count));

  res.json({
    success: true,
    orders: {
      today: todayCount,
      statusCounts,
      needsAction: (statusCounts.pending || 0) + (statusCounts.confirmed || 0) + (statusCounts.processing || 0),
      returnRequests: statusCounts.return_requested || 0,
    },
    thisMonth: monthAgg[0] || { orders: 0, earnings: 0, sales: 0 },
    lifetime: lifetimeAgg[0] || { orders: 0, earnings: 0, sales: 0 },
    inventory: { lowStock, outOfStock, byModeration: Object.fromEntries(productTotals.map((p) => [p._id, p.count])) },
    topProducts,
  });
});
