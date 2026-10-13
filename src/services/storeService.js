/**
 * Puja Material E-Store - core business logic.
 *
 * Money rules
 *  - Product.price is the GST-inclusive selling price. Prices ALWAYS come from the DB, never the client.
 *  - One checkout can contain products of several merchants -> one Order per merchant, all sharing
 *    an `orderGroup`. Online payment is ONE Razorpay payment for the whole group.
 *  - Shipping is charged per merchant shipment (free above STORE_FREE_SHIPPING_ABOVE).
 *  - Coupon discount is split across merchant orders in proportion to their subtotal.
 *  - Settlement (on delivery): vendor earns  base - commission + shipping,
 *    where base = subtotal (platform-funded coupon) or subtotal - discount (vendor-funded coupon).
 *
 * Stock is reserved with atomic conditional updates (no overselling) and restored on cancel / expiry.
 */
const crypto = require("crypto");
const mongoose = require("mongoose");

const Product = require("../models/Product");
const Order = require("../models/Order");
const Vendor = require("../models/Vendor");
const Coupon = require("../models/Coupon");
const Payment = require("../models/Payment");
const Earning = require("../models/Earning");
const Commission = require("../models/Commission");
const ProductReview = require("../models/ProductReview");

const rzp = require("./razorpayService");
const { creditWallet, debitWallet } = require("./walletService");
const { notifyUser } = require("./notificationService");
const { sendMail } = require("./emailService");
const User = require("../models/User");

// ---------------------------------------------------------------- helpers

const round = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

const config = () => ({
  shippingCharge: num(process.env.STORE_SHIPPING_CHARGE, 49),
  freeShippingAbove: num(process.env.STORE_FREE_SHIPPING_ABOVE, 499),
  codEnabled: String(process.env.STORE_COD_ENABLED ?? "true") !== "false",
  codFee: num(process.env.STORE_COD_FEE, 0),
  codMaxAmount: num(process.env.STORE_COD_MAX_AMOUNT, 5000),
  commissionPercent: num(process.env.STORE_COMMISSION_PERCENT, 10),
  paymentTimeoutMin: num(process.env.STORE_PAYMENT_TIMEOUT_MIN, 30),
  returnWindowDays: num(process.env.STORE_RETURN_WINDOW_DAYS, 3),
  productApproval: String(process.env.STORE_PRODUCT_APPROVAL ?? "false") === "true",
});

const safeNotify = async (payload) => {
  try {
    await notifyUser(payload);
  } catch (_) {
    /* a failed notification must never break an order operation */
  }
};

const genOrderNumber = () => {
  const d = new Date();
  const ymd =
    String(d.getFullYear()).slice(2) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  return `VS${ymd}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

const genGroupId = () => `GRP-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.toUpperCase();

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const uniqueSlug = (name) => `${slugify(name) || "product"}-${crypto.randomBytes(2).toString("hex")}`;

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------- address

const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
};

/** Validates & normalises an Indian shipping address. Throws 400 on problems. */
const validateAddress = (a = {}) => {
  const name = String(a.name || "").trim();
  const phone = normalizePhone(a.phone);
  const address = String(a.address || a.line1 || "").trim();
  const line2 = String(a.line2 || "").trim();
  const city = String(a.city || "").trim();
  const state = String(a.state || "").trim();
  const pincode = String(a.pincode || "").trim();

  if (name.length < 2) throw httpError(400, "Receiver name is required");
  if (!/^[6-9]\d{9}$/.test(phone)) throw httpError(400, "Enter a valid 10-digit mobile number");
  if (address.length < 5) throw httpError(400, "Full address is required");
  if (!city) throw httpError(400, "City is required");
  if (!state) throw httpError(400, "State is required");
  if (!/^[1-9]\d{5}$/.test(pincode)) throw httpError(400, "Enter a valid 6-digit pincode");

  return {
    name,
    phone,
    address: line2 ? `${address}, ${line2}` : address,
    landmark: String(a.landmark || "").trim(),
    city,
    state,
    pincode,
  };
};

// ---------------------------------------------------------------- coupons (pure)

/**
 * @returns {{valid:boolean, discount:number, reason?:string}}
 */
const evaluateCoupon = (coupon, { subtotal, userUses = 0, userOrders = 0, now = new Date() }) => {
  const bad = (reason) => ({ valid: false, discount: 0, reason });

  if (!coupon || !coupon.isActive) return bad("Invalid coupon code");
  if (coupon.validFrom && new Date(coupon.validFrom) > now) return bad("This coupon is not active yet");
  if (coupon.validTo && new Date(coupon.validTo) < now) return bad("This coupon has expired");
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return bad("This coupon has been fully redeemed");
  }
  if (coupon.perUserLimit > 0 && userUses >= coupon.perUserLimit) {
    return bad("You have already used this coupon");
  }
  if (coupon.firstOrderOnly && userOrders > 0) return bad("This coupon is valid on your first order only");
  if (subtotal < coupon.minOrderAmount) {
    return bad(`Add items worth ₹${round(coupon.minOrderAmount - subtotal)} more to use this coupon`);
  }

  let discount =
    coupon.type === "percent" ? (subtotal * coupon.value) / 100 : Number(coupon.value);
  if (coupon.type === "percent" && coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  discount = round(Math.min(discount, subtotal));

  if (!(discount > 0)) return bad("This coupon gives no discount on your cart");
  return { valid: true, discount };
};

// ---------------------------------------------------------------- pricing (pure)

/**
 * @param lines   [{ product:{_id,vendor,name,image,price,mrp,gstPercent,sku}, quantity }]
 * @param opts    { couponDiscount, paymentMethod }
 * @returns { orders:[{vendor, items, subtotal, discountAmount, shippingCharge, codFee, taxAmount, totalAmount}],
 *            subtotal, discountAmount, shippingCharge, codFee, taxAmount, grandTotal, itemCount }
 */
const computeCheckoutPricing = (lines, { couponDiscount = 0, paymentMethod = "online" } = {}) => {
  const c = config();
  const byVendor = new Map();

  for (const { product, quantity } of lines) {
    const key = String(product.vendor);
    if (!byVendor.has(key)) byVendor.set(key, { vendor: product.vendor, items: [], subtotal: 0 });
    const g = byVendor.get(key);
    const lineTotal = round(product.price * quantity);
    const gst = num(product.gstPercent);
    g.items.push({
      product: product._id,
      name: product.name,
      image: product.image || product.images?.[0] || "",
      sku: product.sku || "",
      quantity,
      price: product.price,
      mrp: num(product.mrp),
      gstPercent: gst,
      taxAmount: gst > 0 ? round((lineTotal * gst) / (100 + gst)) : 0,
    });
    g.subtotal = round(g.subtotal + lineTotal);
  }

  const groups = [...byVendor.values()];
  const totalSubtotal = round(groups.reduce((s, g) => s + g.subtotal, 0));
  const discountTotal = round(Math.min(num(couponDiscount), totalSubtotal));

  // proportional discount split, remainder goes to the last order so the sum is exact
  let allocated = 0;
  groups.forEach((g, i) => {
    if (i === groups.length - 1) {
      g.discountAmount = round(discountTotal - allocated);
    } else {
      g.discountAmount = totalSubtotal > 0 ? round((discountTotal * g.subtotal) / totalSubtotal) : 0;
      allocated = round(allocated + g.discountAmount);
    }
    const afterDiscount = round(g.subtotal - g.discountAmount);
    g.shippingCharge = afterDiscount >= c.freeShippingAbove ? 0 : round(c.shippingCharge);
    g.codFee = paymentMethod === "cod" ? round(c.codFee) : 0;
    g.taxAmount = round(g.items.reduce((s, it) => s + it.taxAmount, 0));
    g.totalAmount = round(afterDiscount + g.shippingCharge + g.codFee);
  });

  return {
    orders: groups,
    subtotal: totalSubtotal,
    discountAmount: discountTotal,
    shippingCharge: round(groups.reduce((s, g) => s + g.shippingCharge, 0)),
    codFee: round(groups.reduce((s, g) => s + g.codFee, 0)),
    taxAmount: round(groups.reduce((s, g) => s + g.taxAmount, 0)),
    grandTotal: round(groups.reduce((s, g) => s + g.totalAmount, 0)),
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
};

/** Vendor settlement for one order (pure). */
const computeSettlement = ({ subtotal, discountAmount = 0, shippingCharge = 0, couponFundedBy = "" }, commissionPercent) => {
  const base = couponFundedBy === "vendor" ? round(subtotal - discountAmount) : round(subtotal);
  const commissionAmount = round((base * commissionPercent) / 100);
  const vendorAmount = Math.max(0, round(base - commissionAmount + shippingCharge));
  return { base, commissionPercentage: commissionPercent, commissionAmount, vendorAmount };
};

// ---------------------------------------------------------------- order status machine

const MERCHANT_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
};

const CUSTOMER_CANCELLABLE = ["awaiting_payment", "pending", "confirmed", "processing"];

const canMerchantTransition = (from, to) => (MERCHANT_TRANSITIONS[from] || []).includes(to);
const canCustomerCancel = (status) => CUSTOMER_CANCELLABLE.includes(status);

// ---------------------------------------------------------------- catalog helpers

let approvedCache = { ids: null, at: 0 };

/** IDs of approved merchants. Cached 30s so catalog queries stay cheap. */
const approvedMerchantIds = async () => {
  if (approvedCache.ids && Date.now() - approvedCache.at < 30000) return approvedCache.ids;
  const ids = await Vendor.find({ role: "merchant", status: "approved" }).distinct("_id");
  approvedCache = { ids, at: Date.now() };
  return ids;
};
const clearMerchantCache = () => {
  approvedCache = { ids: null, at: 0 };
};

/** Mongo filter for products customers are allowed to see / buy. */
const publicProductFilter = async () => ({
  isActive: true,
  moderation: "approved",
  vendor: { $in: await approvedMerchantIds() },
});

// ---------------------------------------------------------------- stock

/** Atomically reserve stock for every line. All-or-nothing. */
const reserveStock = async (lines) => {
  const reserved = [];
  for (const { product, quantity } of lines) {
    const r = await Product.updateOne(
      { _id: product._id, isActive: true, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } }
    );
    if (r.modifiedCount !== 1) {
      await releaseStock(reserved);
      throw httpError(409, `"${product.name}" just went out of stock or has less quantity available`, {
        productId: product._id,
      });
    }
    reserved.push({ product, quantity });
  }
};

const releaseStock = async (lines) => {
  for (const { product, quantity } of lines) {
    await Product.updateOne({ _id: product._id || product }, { $inc: { stock: quantity } });
  }
};

/** Restore stock for an order exactly once. */
const restockOrder = async (order) => {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, stockRestored: false },
    { $set: { stockRestored: true } },
    { new: false }
  );
  if (!claimed) return false;
  await releaseStock(order.items.map((i) => ({ product: i.product, quantity: i.quantity })));
  return true;
};

// ---------------------------------------------------------------- line loading

/**
 * Loads + validates cart / buy-now lines against the live catalog.
 * @param raw [{ productId, quantity }]
 */
const loadLines = async (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, "Your cart is empty");

  const merged = new Map();
  for (const item of raw) {
    const id = String(item.productId || item.product || "");
    if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid product in cart");
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) throw httpError(400, "Quantity must be a whole number of at least 1");
    merged.set(id, (merged.get(id) || 0) + qty);
  }

  const filter = await publicProductFilter();
  const products = await Product.find({ ...filter, _id: { $in: [...merged.keys()] } });
  const map = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const [id, quantity] of merged) {
    const p = map.get(id);
    if (!p) throw httpError(400, "One or more products are no longer available", { productId: id });
    if (quantity > p.maxPerOrder) {
      throw httpError(400, `You can buy at most ${p.maxPerOrder} of "${p.name}" per order`, { productId: id });
    }
    if (p.stock < quantity) {
      throw httpError(
        409,
        p.stock > 0 ? `Only ${p.stock} of "${p.name}" left in stock` : `"${p.name}" is out of stock`,
        { productId: id }
      );
    }
    lines.push({ product: p, quantity });
  }
  return lines;
};

// ---------------------------------------------------------------- commission

const getCommissionPercent = async (vendor) => {
  if (vendor && vendor.commissionPercentage !== null && vendor.commissionPercentage !== undefined) {
    return num(vendor.commissionPercentage);
  }
  try {
    const rule = await Commission.findOne({ serviceType: "merchant", isActive: true });
    if (rule && Number.isFinite(Number(rule.percentage))) return Number(rule.percentage);
  } catch (_) {
    /* fall through to env default */
  }
  return config().commissionPercent;
};

// ---------------------------------------------------------------- coupon usage

const userCouponUses = async (userId, code) => {
  if (!code) return 0;
  const groups = await Order.distinct("orderGroup", {
    customer: userId,
    couponCode: code,
    status: { $ne: "cancelled" },
  });
  return groups.length;
};

const userPlacedOrders = (userId) =>
  Order.countDocuments({ customer: userId, status: { $nin: ["cancelled", "awaiting_payment"] } });

const findCoupon = (code) =>
  code ? Coupon.findOne({ code: String(code).trim().toUpperCase() }) : null;

/** Validate a code for a user & subtotal. Throws 400 with a friendly reason. */
const resolveCoupon = async (userId, code, subtotal) => {
  if (!code) return { coupon: null, discount: 0 };
  const coupon = await findCoupon(code);
  const result = evaluateCoupon(coupon, {
    subtotal,
    userUses: coupon ? await userCouponUses(userId, coupon.code) : 0,
    userOrders: coupon && coupon.firstOrderOnly ? await userPlacedOrders(userId) : 0,
  });
  if (!result.valid) throw httpError(400, result.reason);
  return { coupon, discount: result.discount };
};

const redeemCoupon = async (coupon) => {
  const r = await Coupon.updateOne(
    {
      _id: coupon._id,
      isActive: true,
      $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
    },
    { $inc: { usedCount: 1 } }
  );
  if (r.modifiedCount !== 1) throw httpError(409, "This coupon has just been fully redeemed");
};

/** Give the coupon use back when EVERY order of the group is cancelled. */
const releaseCouponIfGroupCancelled = async (order) => {
  if (!order.couponCode || !order.orderGroup) return;
  const alive = await Order.countDocuments({
    orderGroup: order.orderGroup,
    status: { $ne: "cancelled" },
  });
  if (alive === 0) {
    await Coupon.updateOne({ code: order.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
};

// ---------------------------------------------------------------- refunds

/**
 * Refund `amount` for an order.
 *  - online order  -> Razorpay refund against the group's payment
 *  - COD order     -> credited to the customer's wallet
 * Never throws: failures are stored on order.refund for admin follow-up.
 */
const refundOrder = async (order, amount, reason = "Order refund") => {
  const value = round(amount);
  if (!(value > 0)) return null;

  try {
    let refundId = "";
    if (order.paymentMethod === "online") {
      const payment = await Payment.findOne({
        orderGroup: order.orderGroup,
        status: { $in: ["paid", "partially_refunded"] },
        razorpayPaymentId: { $ne: null },
      }).sort({ paidAt: 1 });
      if (!payment) throw new Error("No captured payment found for this order");

      const available = round(payment.amount - payment.refundAmount);
      const refundable = Math.min(value, available);
      if (!(refundable > 0)) throw new Error("Nothing left to refund on this payment");

      const refund = await rzp.refundPayment({
        paymentId: payment.razorpayPaymentId,
        amountInr: refundable,
        notes: { orderNumber: order.orderNumber || String(order._id), reason: String(reason).slice(0, 100) },
      });
      refundId = refund.id;

      payment.refundId = refund.id;
      payment.refundAmount = round(payment.refundAmount + refundable);
      payment.status = payment.refundAmount >= payment.amount ? "refunded" : "partially_refunded";
      await payment.save();
    } else {
      const credited = await creditWallet({
        userId: order.customer,
        amount: value,
        category: "refund",
        referenceId: `ORDER-REFUND-${order._id}`,
        description: `Refund for order ${order.orderNumber || order._id}`,
        createdBy: null,
      });
      refundId = `WALLET-${credited?.transaction?._id || order._id}`;
    }

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentStatus: value >= order.totalAmount ? "refunded" : "partially_refunded",
          "refund.amount": value,
          "refund.refundId": refundId,
          "refund.status": "processed",
          "refund.error": "",
          "refund.at": new Date(),
        },
      }
    );
    return { refundId, amount: value };
  } catch (e) {
    console.error("[Store] refund failed for order", String(order._id), e.message);
    await Order.updateOne(
      { _id: order._id },
      { $set: { "refund.amount": value, "refund.status": "failed", "refund.error": String(e.message).slice(0, 300) } }
    );
    return null;
  }
};

// ---------------------------------------------------------------- vendor earnings

/** Credit the merchant once an order is delivered. Idempotent. */
const settleOrderEarning = async (order) => {
  const reference = `ORDER-${order._id}`;
  const vendor = await Vendor.findById(order.vendor).select("user name");
  if (!vendor) return null;

  let earning;
  const existing = await Earning.findOne({ transactionReference: reference });
  if (existing) {
    earning = existing;
  } else {
    try {
      earning = await Earning.create({
        vendor: vendor._id,
        user: vendor.user,
        serviceType: "merchant",
        grossAmount: round(order.subtotal),
        discountAmount: round(order.discountAmount),
        commissionPercentage: order.commissionPercentage,
        commissionAmount: order.commissionAmount,
        taxAmount: round(order.taxAmount),
        netAmount: order.vendorAmount,
        status: "available",
        transactionReference: reference,
        creditedAt: new Date(),
        metadata: {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          settlement: order.paymentMethod === "cod" ? "cash_collected_by_vendor" : "platform_collected",
        },
      });
    } catch (e) {
      if (e.code === 11000) earning = await Earning.findOne({ transactionReference: reference });
      else throw e;
    }
  }

  try {
    if (order.paymentMethod === "cod") {
      // vendor holds the cash (= totalAmount) but is owed vendorAmount
      const diff = round(order.vendorAmount - order.totalAmount);
      if (diff < 0) {
        await debitWallet({
          userId: vendor.user,
          amount: Math.abs(diff),
          category: "commission",
          referenceId: `${reference}-COD-SETTLE`,
          description: `Platform commission on COD order ${order.orderNumber}`,
          createdBy: null,
        });
      } else if (diff > 0) {
        await creditWallet({
          userId: vendor.user,
          amount: diff,
          category: "earning",
          referenceId: `${reference}-COD-SETTLE`,
          description: `COD order ${order.orderNumber} settlement`,
          createdBy: null,
        });
      }
    } else if (order.vendorAmount > 0) {
      await creditWallet({
        userId: vendor.user,
        amount: order.vendorAmount,
        category: "earning",
        referenceId: reference,
        earning: earning._id,
        description: `Earning for order ${order.orderNumber}`,
        createdBy: null,
      });
    }
    await Order.updateOne({ _id: order._id }, { $set: { settled: true } });
  } catch (e) {
    console.error("[Store] settlement wallet step failed:", e.message);
    if (order.paymentMethod === "cod") {
      // vendor wallet too low / missing: keep a note so admin can collect the commission later
      earning.metadata = { ...(earning.metadata || {}), commissionDue: order.commissionAmount, settlementError: e.message };
      earning.markModified("metadata");
      await earning.save();
      await Order.updateOne({ _id: order._id }, { $set: { settled: true } });
    } else {
      // online order: leave settled=false so admin can retry via /store/admin/orders/:id/settle
      return earning;
    }
  }

  await safeNotify({
    userId: vendor.user,
    title: "Order earning recorded",
    message: `₹${order.vendorAmount} earned from order ${order.orderNumber}.`,
    type: "earning_created",
    referenceId: earning?._id,
    referenceType: "earning",
  });
  return earning;
};

/** Reverse (part of) a merchant earning after a refund of a delivered order. */
const reverseOrderEarning = async (order, refundedAmount) => {
  if (!order.settled || !(order.totalAmount > 0)) return;
  const vendor = await Vendor.findById(order.vendor).select("user");
  if (!vendor) return;

  const ratio = Math.min(1, refundedAmount / order.totalAmount);
  const reverse = round(order.vendorAmount * ratio);
  const reference = `ORDER-${order._id}`;
  const earning = await Earning.findOne({ transactionReference: reference });

  if (reverse > 0 && order.paymentMethod === "online") {
    try {
      await debitWallet({
        userId: vendor.user,
        amount: reverse,
        category: "adjustment",
        referenceId: `${reference}-REVERSAL`,
        description: `Reversal for refunded order ${order.orderNumber}`,
        createdBy: null,
      });
    } catch (e) {
      if (earning) {
        earning.metadata = { ...(earning.metadata || {}), reversalDue: reverse };
        earning.markModified("metadata");
      }
    }
  }
  if (earning) {
    if (ratio >= 1) {
      earning.status = "reversed";
      earning.reversedAt = new Date();
      earning.reversalReason = "Order returned / refunded";
    }
    await earning.save();
  }
};

// ---------------------------------------------------------------- notifications

const orderNotifyTexts = {
  placed: (o) => ({ title: "Order placed", message: `Your order ${o.orderNumber} (₹${o.totalAmount}) is placed.`, type: "order_created" }),
  confirmed: (o) => ({ title: "Order confirmed", message: `Order ${o.orderNumber} is confirmed by the seller.`, type: "order_confirmed" }),
  processing: (o) => ({ title: "Order being packed", message: `Order ${o.orderNumber} is being packed.`, type: "general" }),
  shipped: (o) => ({
    title: "Order shipped",
    message: `Order ${o.orderNumber} is on the way${o.tracking?.trackingId ? ` (Tracking: ${o.tracking.trackingId})` : ""}.`,
    type: "order_shipped",
  }),
  out_for_delivery: (o) => ({ title: "Out for delivery", message: `Order ${o.orderNumber} will be delivered today.`, type: "general" }),
  delivered: (o) => ({ title: "Order delivered", message: `Order ${o.orderNumber} was delivered. Please rate your products.`, type: "order_delivered" }),
  cancelled: (o) => ({
    title: "Order cancelled",
    message: `Order ${o.orderNumber} was cancelled.${o.cancelReason ? ` Reason: ${o.cancelReason}` : ""}`,
    type: "order_cancelled",
  }),
  returned: (o) => ({ title: "Return approved", message: `Return for order ${o.orderNumber} was approved. Refund is on the way.`, type: "general" }),
};

const EMAIL_EVENTS = ["placed", "shipped", "delivered", "cancelled", "returned"];

const emailCustomer = async (order, text) => {
  try {
    const user = await User.findById(order.customer).select("email name");
    if (!user?.email) return;
    await sendMail({ to: user.email, subject: `${text.title} - Order ${order.orderNumber}`, text: `Namaste${user.name ? ` ${user.name}` : ""},\n\n${text.message}\n\nTotal: ₹${order.totalAmount}` });
  } catch (_) {
    /* email is best-effort */
  }
};

const notifyCustomer = (order, event) => {
  const t = orderNotifyTexts[event]?.(order);
  if (!t) return Promise.resolve();
  if (EMAIL_EVENTS.includes(event)) emailCustomer(order, t);
  return safeNotify({
    userId: order.customer,
    ...t,
    referenceId: order._id,
    referenceType: "order",
    data: { orderId: String(order._id), orderNumber: order.orderNumber || "" },
  });
};

const notifyMerchant = async (order, title, message, type = "order_created") => {
  const vendor = await Vendor.findById(order.vendor).select("user");
  if (!vendor) return;
  await safeNotify({
    userId: vendor.user,
    title,
    message,
    type,
    referenceId: order._id,
    referenceType: "order",
    data: { orderId: String(order._id), orderNumber: order.orderNumber || "" },
  });
};

// ---------------------------------------------------------------- order lifecycle

const history = (status, by, note = "") => ({ status, by, note, at: new Date() });

/** Move online-paid orders from awaiting_payment -> pending (placed). */
const activatePaidOrders = async (orderGroup, paymentRef) => {
  const awaiting = await Order.find({ orderGroup, status: "awaiting_payment" });
  const activated = [];
  for (const o of awaiting) {
    const updated = await Order.findOneAndUpdate(
      { _id: o._id, status: "awaiting_payment" },
      {
        $set: {
          status: "pending",
          paymentStatus: "paid",
          paymentId: paymentRef,
          paidAt: new Date(),
          advanceAmount: o.totalAmount,
          remainingAmount: 0,
          expiresAt: null,
        },
        $push: { statusHistory: history("pending", "system", "Payment received") },
      },
      { new: true }
    );
    if (updated) activated.push(updated);
  }
  return activated;
};

/**
 * Called by paymentService.markPaid for purpose "store_order". Idempotent.
 * Anything the activated orders don't need (expired order, duplicate payment) is refunded.
 */
const onPaymentSuccess = async (payment) => {
  const group = payment.orderGroup;
  if (!group) return [];

  const activated = await activatePaidOrders(group, payment.razorpayPaymentId || "");
  const activatedTotal = round(activated.reduce((s, o) => s + o.totalAmount, 0));
  const excess = round(payment.amount - activatedTotal);

  // customer paid for orders that already expired / got cancelled, or paid twice -> give it back
  if (excess > 0.5) {
    try {
      const fresh = await Payment.findById(payment._id);
      const available = round(fresh.amount - fresh.refundAmount);
      const refundable = Math.min(excess, available);
      if (refundable > 0) {
        const refund = await rzp.refundPayment({
          paymentId: fresh.razorpayPaymentId,
          amountInr: refundable,
          notes: { reason: "Order expired or duplicate payment", group },
        });
        fresh.refundId = refund.id;
        fresh.refundAmount = round(fresh.refundAmount + refundable);
        fresh.status = fresh.refundAmount >= fresh.amount ? "refunded" : "partially_refunded";
        await fresh.save();
      }
    } catch (e) {
      console.error("[Store] auto-refund of excess payment failed:", e.message);
    }
  }

  for (const o of activated) {
    await notifyCustomer(o, "placed");
    await notifyMerchant(o, "New order received", `Order ${o.orderNumber} worth ₹${o.totalAmount} is waiting for you.`);
  }
  return activated;
};

/** Undo a half-finished checkout: cancel created orders, give stock + coupon back. */
const abortCreation = async (created, lines, coupon) => {
  if (created.length) {
    await Order.updateMany(
      { _id: { $in: created.map((o) => o._id) } },
      {
        $set: {
          status: "cancelled",
          stockRestored: true, // stock is released once below, from `lines`
          cancelReason: "Checkout failed",
          cancelledBy: "system",
          cancelledAt: new Date(),
          expiresAt: null,
        },
        $push: { statusHistory: history("cancelled", "system", "Checkout failed") },
      }
    );
  }
  await releaseStock(lines);
  if (coupon) {
    await Coupon.updateOne({ _id: coupon._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
};

/**
 * Create the order(s) for a checkout.
 * @returns {{orderGroup, orders, pricing, payment|null}}
 */
const placeOrders = async ({ user, rawLines, address, couponCode, paymentMethod, note = "" }) => {
  const c = config();
  const method = String(paymentMethod || "online").toLowerCase();
  if (!["online", "cod"].includes(method)) throw httpError(400, "paymentMethod must be online or cod");
  if (method === "cod" && !c.codEnabled) throw httpError(400, "Cash on delivery is not available right now");

  const shippingAddress = validateAddress(address);
  const lines = await loadLines(rawLines);

  const rawSubtotal = round(lines.reduce((s, l) => s + l.product.price * l.quantity, 0));
  const { coupon, discount } = await resolveCoupon(user._id, couponCode, rawSubtotal);
  const pricing = computeCheckoutPricing(lines, { couponDiscount: discount, paymentMethod: method });

  if (method === "cod" && pricing.grandTotal > c.codMaxAmount) {
    throw httpError(400, `Cash on delivery is available up to ₹${c.codMaxAmount}. Please pay online for this order.`);
  }

  await reserveStock(lines);

  if (coupon) {
    try {
      await redeemCoupon(coupon);
    } catch (e) {
      await releaseStock(lines);
      throw e;
    }
  }

  const vendors = await Vendor.find({ _id: { $in: pricing.orders.map((o) => o.vendor) } });
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  const orderGroup = genGroupId();
  const isFree = pricing.grandTotal <= 0;
  const awaiting = method === "online" && !isFree;
  const expiresAt = awaiting ? new Date(Date.now() + c.paymentTimeoutMin * 60000) : null;

  const created = [];
  try {
    for (const g of pricing.orders) {
      const pct = await getCommissionPercent(vendorMap.get(String(g.vendor)));
      const fundedBy = coupon ? coupon.fundedBy : "";
      const settlement = computeSettlement({ ...g, couponFundedBy: fundedBy }, pct);
      const startStatus = awaiting ? "awaiting_payment" : "pending";

      const doc = await Order.create({
        orderNumber: genOrderNumber(),
        orderGroup,
        customer: user._id,
        vendor: g.vendor,
        items: g.items,
        subtotal: g.subtotal,
        discountAmount: g.discountAmount,
        couponCode: coupon ? coupon.code : "",
        couponFundedBy: fundedBy,
        shippingCharge: g.shippingCharge,
        codFee: g.codFee,
        taxAmount: g.taxAmount,
        totalAmount: g.totalAmount,
        advanceAmount: isFree ? g.totalAmount : 0,
        remainingAmount: isFree ? 0 : g.totalAmount,
        commissionPercentage: settlement.commissionPercentage,
        commissionAmount: settlement.commissionAmount,
        vendorAmount: settlement.vendorAmount,
        status: startStatus,
        statusHistory: [history(startStatus, "customer", awaiting ? "Awaiting payment" : "Order placed")],
        paymentMethod: method,
        paymentStatus: isFree ? "paid" : "pending",
        paidAt: isFree ? new Date() : null,
        shippingAddress,
        note: String(note || "").slice(0, 300),
        expiresAt,
      });
      created.push(doc);
    }
  } catch (e) {
    await abortCreation(created, lines, coupon);
    throw e;
  }

  let paymentInfo = null;
  if (awaiting) {
    try {
      paymentInfo = await createGatewayPayment({ user, orderGroup, amount: pricing.grandTotal });
    } catch (e) {
      await abortCreation(created, lines, coupon);
      throw e;
    }
  } else {
    for (const o of created) {
      await notifyCustomer(o, "placed");
      await notifyMerchant(o, "New order received", `Order ${o.orderNumber} worth ₹${o.totalAmount} (${method === "cod" ? "COD" : "paid"}) is waiting for you.`);
    }
  }

  return { orderGroup, orders: created, pricing, payment: paymentInfo };
};

/** Creates the Razorpay order + Payment row for a whole checkout group. */
const createGatewayPayment = async ({ user, orderGroup, amount }) => {
  const order = await rzp.createOrder({
    amountInr: amount,
    receipt: `store-${orderGroup}`,
    notes: { purpose: "store_order", orderGroup, user: String(user._id) },
  });
  const payment = await Payment.create({
    user: user._id,
    purpose: "store_order",
    orderGroup,
    amount,
    razorpayOrderId: order.id,
  });
  return {
    paymentId: payment._id,
    razorpayOrderId: order.id,
    amount,
    amountPaise: order.amount,
    currency: order.currency,
    keyId: rzp.keyId(),
  };
};

/** Customer wants to retry paying for an unpaid online checkout. */
const retryPayment = async (user, orderGroup) => {
  const orders = await Order.find({ orderGroup, customer: user._id });
  if (orders.length === 0) throw httpError(404, "Order not found");
  const awaiting = orders.filter((o) => o.status === "awaiting_payment");
  if (awaiting.length === 0) throw httpError(409, "This order is not awaiting payment");
  if (awaiting.some((o) => o.expiresAt && o.expiresAt < new Date())) {
    throw httpError(409, "Payment time expired. Please place the order again.");
  }
  const amount = round(awaiting.reduce((s, o) => s + o.totalAmount, 0));
  return createGatewayPayment({ user, orderGroup, amount });
};

/**
 * Cancel an order (idempotent). Restores stock, releases coupon, refunds if it was paid.
 * `by`: customer | merchant | admin | system
 */
const cancelOrder = async (order, { by = "system", reason = "" } = {}) => {
  const wasPaid = order.paymentStatus === "paid";
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $nin: ["cancelled", "returned"] } },
    {
      $set: {
        status: "cancelled",
        cancelReason: String(reason || "").trim().slice(0, 300),
        cancelledBy: by,
        cancelledAt: new Date(),
        expiresAt: null,
      },
      $push: { statusHistory: history("cancelled", by, reason) },
    },
    { new: true }
  );
  if (!updated) return order; // already cancelled

  await restockOrder(updated);
  await releaseCouponIfGroupCancelled(updated);

  if (wasPaid && updated.totalAmount > 0) {
    await refundOrder(updated, updated.totalAmount, reason || "Order cancelled");
  }

  const fresh = await Order.findById(updated._id);
  await notifyCustomer(fresh, "cancelled");
  if (by !== "merchant") {
    await notifyMerchant(fresh, "Order cancelled", `Order ${fresh.orderNumber} was cancelled.`, "order_cancelled");
  }
  return fresh;
};

/**
 * Move an order forward (merchant / admin).
 * @param {object} extra { trackingId, courier, trackingUrl, expectedDelivery, note }
 */
const advanceOrder = async (order, nextStatus, { by = "merchant", extra = {}, force = false } = {}) => {
  const from = order.status;
  if (nextStatus === "cancelled") {
    if (!force && !canMerchantTransition(from, "cancelled")) {
      throw httpError(400, `Order cannot be cancelled once it is ${from}`);
    }
    return cancelOrder(order, { by, reason: extra.note || "Cancelled by seller" });
  }
  if (!force && !canMerchantTransition(from, nextStatus)) {
    throw httpError(400, `Cannot move an order from "${from}" to "${nextStatus}"`);
  }
  if (nextStatus === "shipped" && !force && !String(extra.courier || order.tracking?.courier || "").trim()) {
    throw httpError(400, "Courier / delivery partner name is required to mark an order shipped");
  }

  const set = { status: nextStatus };
  if (nextStatus === "shipped") {
    set["tracking.shippedAt"] = new Date();
    if (extra.courier !== undefined) set["tracking.courier"] = String(extra.courier).trim();
    if (extra.trackingId !== undefined) set["tracking.trackingId"] = String(extra.trackingId).trim();
    if (extra.trackingUrl !== undefined) set["tracking.trackingUrl"] = String(extra.trackingUrl).trim();
    if (extra.expectedDelivery) set["tracking.expectedDelivery"] = new Date(extra.expectedDelivery);
  }
  if (nextStatus === "delivered") {
    set["tracking.deliveredAt"] = new Date();
    if (order.paymentMethod === "cod") {
      set.paymentStatus = "paid";
      set.paidAt = new Date();
      set.advanceAmount = order.totalAmount;
      set.remainingAmount = 0;
    }
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: from },
    { $set: set, $push: { statusHistory: history(nextStatus, by, extra.note || "") } },
    { new: true }
  );
  if (!updated) throw httpError(409, "Order was updated by someone else. Refresh and try again.");

  if (nextStatus === "delivered") {
    for (const it of updated.items) {
      await Product.updateOne({ _id: it.product }, { $inc: { soldCount: it.quantity } });
    }
    await settleOrderEarning(updated);
  }
  await notifyCustomer(updated, nextStatus);
  return Order.findById(updated._id);
};

// ---------------------------------------------------------------- returns

const RETURN_REASONS = ["damaged", "wrong_item", "missing_item", "quality_issue", "not_needed"];

const requestReturn = async (order, { reason, description = "", images = [] }) => {
  const c = config();
  if (order.status !== "delivered") throw httpError(400, "Only delivered orders can be returned");
  if (!RETURN_REASONS.includes(reason)) {
    throw httpError(400, `reason must be one of: ${RETURN_REASONS.join(", ")}`);
  }
  const deliveredAt = order.tracking?.deliveredAt || order.updatedAt;
  const days = (Date.now() - new Date(deliveredAt).getTime()) / 86400000;
  if (days > c.returnWindowDays) {
    throw httpError(400, `Return window of ${c.returnWindowDays} day(s) has passed`);
  }

  // consumable puja items are non-returnable unless they arrived damaged / wrong / incomplete
  const defectReasons = ["damaged", "wrong_item", "missing_item", "quality_issue"];
  if (!defectReasons.includes(reason)) {
    const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select("isReturnable");
    if (!products.every((p) => p.isReturnable)) {
      throw httpError(400, "These items are non-returnable. You can still report damaged / wrong / missing items.");
    }
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: "delivered" },
    {
      $set: {
        status: "return_requested",
        returnRequest: {
          reason,
          description: String(description).slice(0, 500),
          images: (Array.isArray(images) ? images : []).slice(0, 5).map(String),
          requestedAt: new Date(),
          status: "requested",
        },
      },
      $push: { statusHistory: history("return_requested", "customer", reason) },
    },
    { new: true }
  );
  if (!updated) throw httpError(409, "Order status changed. Refresh and try again.");
  await notifyMerchant(updated, "Return requested", `Customer requested a return for order ${updated.orderNumber}.`, "general");
  return updated;
};

/** Admin resolves a return: approve (refund) or reject (back to delivered). */
const resolveReturn = async (order, { action, refundAmount, note = "" }) => {
  if (order.status !== "return_requested") throw httpError(400, "No pending return request on this order");

  if (action === "reject") {
    return Order.findOneAndUpdate(
      { _id: order._id, status: "return_requested" },
      {
        $set: { status: "delivered", "returnRequest.status": "rejected", "returnRequest.resolvedAt": new Date(), "returnRequest.adminNote": note },
        $push: { statusHistory: history("delivered", "admin", `Return rejected. ${note}`) },
      },
      { new: true }
    );
  }
  if (action !== "approve") throw httpError(400, "action must be approve or reject");

  const amount = refundAmount !== undefined ? round(refundAmount) : order.totalAmount;
  if (!(amount > 0) || amount > order.totalAmount) throw httpError(400, "Invalid refund amount");

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: "return_requested" },
    {
      $set: { status: "returned", "returnRequest.status": "approved", "returnRequest.resolvedAt": new Date(), "returnRequest.adminNote": note },
      $push: { statusHistory: history("returned", "admin", note) },
    },
    { new: true }
  );
  if (!updated) throw httpError(409, "Order status changed. Refresh and try again.");

  await refundOrder(updated, amount, "Return approved");
  await reverseOrderEarning(updated, amount);
  for (const it of updated.items) {
    await Product.updateOne({ _id: it.product, soldCount: { $gte: it.quantity } }, { $inc: { soldCount: -it.quantity } });
  }
  await notifyCustomer(updated, "returned");
  return Order.findById(updated._id);
};

// ---------------------------------------------------------------- reviews

const recalcProductRating = async (productId) => {
  const [agg] = await ProductReview.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), isHidden: false } },
    { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    { $set: { ratingAvg: agg ? round(agg.avg) : 0, ratingCount: agg ? agg.count : 0 } }
  );
};

// ---------------------------------------------------------------- expiry sweeper

let sweeperTimer = null;

const sweepExpiredOrders = async () => {
  const expired = await Order.find({ status: "awaiting_payment", expiresAt: { $lt: new Date() } }).limit(100);
  for (const o of expired) {
    try {
      await cancelOrder(o, { by: "system", reason: "Payment not completed in time" });
    } catch (e) {
      console.error("[Store] expiry sweep failed for", String(o._id), e.message);
    }
  }
  return expired.length;
};

const startStoreSweeper = () => {
  if (sweeperTimer) return;
  sweeperTimer = setInterval(() => {
    sweepExpiredOrders().catch((e) => console.error("[Store] sweeper error:", e.message));
  }, 5 * 60 * 1000);
  if (sweeperTimer.unref) sweeperTimer.unref();
  console.log("[Store] unpaid-order sweeper started");
};

const stopStoreSweeper = () => {
  if (sweeperTimer) clearInterval(sweeperTimer);
  sweeperTimer = null;
};

module.exports = {
  // config / helpers
  config,
  round,
  httpError,
  slugify,
  uniqueSlug,
  escapeRegex,
  genOrderNumber,
  // pure logic (unit-tested)
  normalizePhone,
  validateAddress,
  evaluateCoupon,
  computeCheckoutPricing,
  computeSettlement,
  canMerchantTransition,
  canCustomerCancel,
  RETURN_REASONS,
  // catalog
  approvedMerchantIds,
  clearMerchantCache,
  publicProductFilter,
  loadLines,
  // coupons
  resolveCoupon,
  findCoupon,
  // orders
  placeOrders,
  retryPayment,
  cancelOrder,
  advanceOrder,
  requestReturn,
  resolveReturn,
  onPaymentSuccess,
  refundOrder,
  settleOrderEarning,
  recalcProductRating,
  // sweeper
  sweepExpiredOrders,
  startStoreSweeper,
  stopStoreSweeper,
};
