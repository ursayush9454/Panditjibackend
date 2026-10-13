/**
 * Legacy customer order endpoints (/api/partner/orders). Kept for existing app builds.
 * They now run on the same engine as the new e-store (/api/partner/store):
 * atomic stock, GST/shipping totals, order numbers, status history, refunds.
 * New clients should use /api/partner/store/checkout instead.
 */
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const store = require("../services/storeService");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error(`[Orders] ${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

// =====================================
// CREATE ORDER (cash on delivery / pay later)
// =====================================
exports.createOrder = handle("createOrder", async (req, res) => {
  const { vendorId, items, shippingAddress } = req.body;

  if (!vendorId || !mongoose.isValidObjectId(vendorId)) return fail(res, 400, "Vendor ID is required");
  if (!Array.isArray(items) || items.length === 0) return fail(res, 400, "At least one product is required");

  const ids = items.map((i) => i.productId).filter((id) => mongoose.isValidObjectId(id));
  const count = await Product.countDocuments({ _id: { $in: ids }, vendor: vendorId });
  if (count !== new Set(ids.map(String)).size) {
    return fail(res, 400, "One or more products are invalid or unavailable");
  }

  const result = await store.placeOrders({
    user: req.user,
    rawLines: items,
    address: shippingAddress,
    paymentMethod: "cod",
    note: req.body.note,
  });

  const order = await Order.findById(result.orders[0]._id)
    .populate("vendor", "name role city state")
    .populate("items.product");

  return res.status(201).json({ success: true, message: "Order created successfully", order });
});

// =====================================
// GET MY ORDERS
// =====================================
exports.getMyOrders = handle("getMyOrders", async (req, res) => {
  const orders = await Order.find({ customer: req.user.id })
    .populate("vendor", "name role city state")
    .populate("items.product")
    .sort({ createdAt: -1 });
  return res.json({ success: true, count: orders.length, orders });
});

// =====================================
// GET SINGLE MY ORDER
// =====================================
exports.getMyOrder = handle("getMyOrder", async (req, res) => {
  const order = mongoose.isValidObjectId(req.params.id)
    ? await Order.findOne({ _id: req.params.id, customer: req.user.id })
        .populate("vendor", "name role city state")
        .populate("items.product")
    : null;
  if (!order) return fail(res, 404, "Order not found");
  return res.json({ success: true, order });
});

// =====================================
// CANCEL MY ORDER
// =====================================
exports.cancelOrder = handle("cancelOrder", async (req, res) => {
  const order = mongoose.isValidObjectId(req.params.id)
    ? await Order.findOne({ _id: req.params.id, customer: req.user.id })
    : null;
  if (!order) return fail(res, 404, "Order not found");

  if (!store.canCustomerCancel(order.status)) {
    return fail(res, 400, `Order cannot be cancelled because it is ${order.status}`);
  }

  const updated = await store.cancelOrder(order, {
    by: "customer",
    reason: String(req.body.reason || "Cancelled by customer").trim(),
  });
  return res.json({ success: true, message: "Order cancelled successfully", order: updated });
});
