/**
 * Customer-facing e-store API: catalog, cart, wishlist, addresses, checkout, orders, reviews, coupons.
 */
const mongoose = require("mongoose");

const Product = require("../models/Product");
const Category = require("../models/Category");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const Address = require("../models/Address");
const Coupon = require("../models/Coupon");
const Order = require("../models/Order");
const Vendor = require("../models/Vendor");
const Puja = require("../models/Puja");
const ProductReview = require("../models/ProductReview");

const store = require("../services/storeService");

const { round, httpError } = store;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message, e.productId ? { productId: e.productId } : {});
    if (e.name === "ValidationError") return fail(res, 400, e.message);
    console.error(`[Store] ${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

const validId = (id) => mongoose.isValidObjectId(id);
const pageParams = (q, defLimit = 20) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const PRODUCT_LIST_FIELDS =
  "name slug image images price mrp gstPercent stock category categoryRef brand unit weightGrams isKit isFeatured ratingAvg ratingCount soldCount vendor tags isReturnable maxPerOrder";

/** Strip internals + add UI helpers */
const shapeProduct = (p) => {
  const o = typeof p.toObject === "function" ? p.toObject({ virtuals: true }) : p;
  delete o.id;
  delete o.__v;
  o.inStock = o.stock > 0;
  o.lowStock = o.stock > 0 && o.stock <= (o.lowStockThreshold ?? 5);
  if (!o.discountPercent && o.mrp > o.price) o.discountPercent = Math.round(((o.mrp - o.price) / o.mrp) * 100);
  return o;
};

// =====================================================================
// CATALOG (public)
// =====================================================================

exports.getCategories = handle("getCategories", async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  // product counts per category (only buyable products)
  const filter = await store.publicProductFilter();
  const counts = await Product.aggregate([
    { $match: { ...filter, categoryRef: { $ne: null } } },
    { $group: { _id: "$categoryRef", count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    success: true,
    categories: categories.map((c) => ({ ...c, productCount: map.get(String(c._id)) || 0 })),
  });
});

exports.getHome = handle("getHome", async (req, res) => {
  const filter = await store.publicProductFilter();
  const inStock = { ...filter, stock: { $gt: 0 } };

  const [categories, featured, bestSellers, newArrivals, kits, coupons] = await Promise.all([
    Category.find({ isActive: true, parent: null }).sort({ sortOrder: 1, name: 1 }).limit(24).lean(),
    Product.find({ ...inStock, isFeatured: true }).select(PRODUCT_LIST_FIELDS).sort({ updatedAt: -1 }).limit(12),
    Product.find({ ...inStock, soldCount: { $gt: 0 } }).select(PRODUCT_LIST_FIELDS).sort({ soldCount: -1 }).limit(12),
    Product.find(inStock).select(PRODUCT_LIST_FIELDS).sort({ createdAt: -1 }).limit(12),
    Product.find({ ...inStock, isKit: true }).select(PRODUCT_LIST_FIELDS).sort({ soldCount: -1, createdAt: -1 }).limit(10),
    Coupon.find({
      isActive: true,
      $and: [
        { $or: [{ validFrom: null }, { validFrom: { $lte: new Date() } }] },
        { $or: [{ validTo: null }, { validTo: { $gte: new Date() } }] },
      ],
    })
      .select("code description type value maxDiscount minOrderAmount validTo")
      .limit(5)
      .lean(),
  ]);

  res.json({
    success: true,
    categories,
    featured: featured.map(shapeProduct),
    bestSellers: bestSellers.map(shapeProduct),
    newArrivals: newArrivals.map(shapeProduct),
    kits: kits.map(shapeProduct),
    offers: coupons,
  });
});

exports.listProducts = handle("listProducts", async (req, res) => {
  const q = req.query;
  const { page, limit, skip } = pageParams(q);
  const filter = await store.publicProductFilter();

  if (q.q || q.search) {
    const rx = new RegExp(store.escapeRegex(String(q.q || q.search).trim()), "i");
    filter.$or = [{ name: rx }, { tags: rx }, { category: rx }, { brand: rx }, { description: rx }];
  }

  if (q.category) {
    const key = String(q.category);
    const cat = validId(key) ? await Category.findById(key) : await Category.findOne({ slug: key.toLowerCase() });
    if (!cat) return res.json({ success: true, products: [], total: 0, page, pages: 0 });
    const children = await Category.find({ parent: cat._id }).distinct("_id");
    filter.categoryRef = { $in: [cat._id, ...children] };
  }

  if (q.vendor && validId(q.vendor)) filter.vendor = new mongoose.Types.ObjectId(q.vendor);
  if (q.puja && validId(q.puja)) filter.relatedPujas = new mongoose.Types.ObjectId(q.puja);
  if (q.kit === "true") filter.isKit = true;
  if (q.featured === "true") filter.isFeatured = true;
  if (q.inStock === "true") filter.stock = { $gt: 0 };

  if (q.minPrice || q.maxPrice) {
    filter.price = {};
    if (Number.isFinite(Number(q.minPrice)) && q.minPrice !== "") filter.price.$gte = Number(q.minPrice);
    if (Number.isFinite(Number(q.maxPrice)) && q.maxPrice !== "") filter.price.$lte = Number(q.maxPrice);
  }
  if (q.minRating && Number(q.minRating) > 0) filter.ratingAvg = { $gte: Number(q.minRating) };

  const sorts = {
    popular: { soldCount: -1, ratingCount: -1 },
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { ratingAvg: -1, ratingCount: -1 },
  };
  const sort = sorts[q.sort] || sorts.popular;

  const [products, total] = await Promise.all([
    Product.find(filter).select(PRODUCT_LIST_FIELDS).sort(sort).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    products: products.map(shapeProduct),
  });
});

exports.getProduct = handle("getProduct", async (req, res) => {
  const key = req.params.idOrSlug;
  const filter = await store.publicProductFilter();
  const product = await Product.findOne({
    ...filter,
    ...(validId(key) ? { _id: key } : { slug: String(key).toLowerCase() }),
  })
    .populate("vendor", "name city state profileImage")
    .populate("categoryRef", "name slug")
    .populate("relatedPujas", "name slug image");

  if (!product) return fail(res, 404, "Product not found");

  const [related, dist, wished] = await Promise.all([
    Product.find({
      ...filter,
      _id: { $ne: product._id },
      stock: { $gt: 0 },
      ...(product.categoryRef ? { categoryRef: product.categoryRef._id } : {}),
    })
      .select(PRODUCT_LIST_FIELDS)
      .sort({ soldCount: -1 })
      .limit(8),
    ProductReview.aggregate([
      { $match: { product: product._id, isHidden: false } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
    ]),
    req.user ? Wishlist.exists({ user: req.user._id, products: product._id }) : null,
  ]);

  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  dist.forEach((d) => (ratingBreakdown[d._id] = d.count));

  res.json({
    success: true,
    product: shapeProduct(product),
    related: related.map(shapeProduct),
    ratingBreakdown,
    isWishlisted: !!wished,
    returnPolicy: store.config().returnWindowDays,
    shipping: { charge: store.config().shippingCharge, freeAbove: store.config().freeShippingAbove },
  });
});

/** Samagri / kit products linked to a puja ritual */
exports.getPujaKit = handle("getPujaKit", async (req, res) => {
  const key = req.params.pujaId;
  const puja = await Puja.findOne({ isActive: true, ...(validId(key) ? { _id: key } : { slug: String(key).toLowerCase() }) }).select(
    "name slug image samagriProducts samagriTitle samagriDescription samagriComboPrice"
  );
  if (!puja) return fail(res, 404, "Puja not found");

  const filter = await store.publicProductFilter();
  const products = await Product.find({
    ...filter,
    $or: [{ _id: { $in: puja.samagriProducts || [] } }, { relatedPujas: puja._id }],
  })
    .select(PRODUCT_LIST_FIELDS)
    .sort({ isKit: -1, soldCount: -1 });

  res.json({ success: true, puja, products: products.map(shapeProduct) });
});

exports.getProductReviews = handle("getProductReviews", async (req, res) => {
  const { id } = req.params;
  if (!validId(id)) return fail(res, 400, "Invalid product id");
  const { page, limit, skip } = pageParams(req.query, 10);
  const filter = { product: id, isHidden: false };
  const [reviews, total] = await Promise.all([
    ProductReview.find(filter).populate("user", "name profileImage").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ProductReview.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), reviews });
});

// =====================================================================
// CART
// =====================================================================

const buildCartView = async (userId, couponCode) => {
  const cart = await Cart.findOne({ user: userId });
  const empty = { items: [], pricing: store.computeCheckoutPricing([]), couponError: null, unavailableCount: 0 };
  if (!cart || cart.items.length === 0) return empty;

  const filter = await store.publicProductFilter();
  const products = await Product.find({ ...filter, _id: { $in: cart.items.map((i) => i.product) } }).populate("vendor", "name city");
  const map = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  const buyable = [];
  for (const it of cart.items) {
    const p = map.get(String(it.product));
    if (!p) {
      items.push({ productId: it.product, quantity: it.quantity, available: false, reason: "No longer available" });
      continue;
    }
    let available = true;
    let reason = "";
    if (p.stock < 1) {
      available = false;
      reason = "Out of stock";
    } else if (it.quantity > p.stock) {
      available = false;
      reason = `Only ${p.stock} left`;
    } else if (it.quantity > p.maxPerOrder) {
      available = false;
      reason = `Max ${p.maxPerOrder} per order`;
    }
    items.push({
      productId: p._id,
      name: p.name,
      slug: p.slug,
      image: p.image || p.images?.[0] || "",
      price: p.price,
      mrp: p.mrp,
      quantity: it.quantity,
      lineTotal: round(p.price * it.quantity),
      stock: p.stock,
      maxPerOrder: p.maxPerOrder,
      vendor: p.vendor ? { _id: p.vendor._id, name: p.vendor.name, city: p.vendor.city } : null,
      available,
      reason,
    });
    if (available) buyable.push({ product: p, quantity: it.quantity });
  }

  let discount = 0;
  let couponError = null;
  let appliedCoupon = null;
  if (couponCode && buyable.length) {
    try {
      const subtotal = round(buyable.reduce((s, l) => s + l.product.price * l.quantity, 0));
      const r = await store.resolveCoupon(userId, couponCode, subtotal);
      discount = r.discount;
      appliedCoupon = r.coupon?.code || null;
    } catch (e) {
      couponError = e.message;
    }
  }

  return {
    items,
    pricing: store.computeCheckoutPricing(buyable, { couponDiscount: discount }),
    appliedCoupon,
    couponError,
    unavailableCount: items.filter((i) => !i.available).length,
  };
};

exports.getCart = handle("getCart", async (req, res) => {
  const view = await buildCartView(req.user._id, req.query.coupon);
  res.json({ success: true, ...view });
});

exports.addToCart = handle("addToCart", async (req, res) => {
  const { productId } = req.body;
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);
  if (!validId(productId)) return fail(res, 400, "Valid productId is required");
  if (!Number.isInteger(quantity) || quantity < 1) return fail(res, 400, "Quantity must be a whole number of at least 1");

  const filter = await store.publicProductFilter();
  const product = await Product.findOne({ ...filter, _id: productId });
  if (!product) return fail(res, 404, "Product not found or unavailable");
  if (product.stock < 1) return fail(res, 409, "This product is out of stock");

  const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
  const existing = cart.items.find((i) => String(i.product) === String(product._id));
  const newQty = (existing ? existing.quantity : 0) + quantity;

  if (newQty > product.maxPerOrder) return fail(res, 400, `You can buy at most ${product.maxPerOrder} of this product per order`);
  if (newQty > product.stock) return fail(res, 409, `Only ${product.stock} left in stock`);

  if (existing) existing.quantity = newQty;
  else cart.items.push({ product: product._id, quantity });
  await cart.save();

  const view = await buildCartView(req.user._id);
  res.status(201).json({ success: true, message: "Added to cart", ...view });
});

exports.updateCartItem = handle("updateCartItem", async (req, res) => {
  const { productId } = req.params;
  const quantity = Number(req.body.quantity);
  if (!validId(productId)) return fail(res, 400, "Invalid product id");
  if (!Number.isInteger(quantity) || quantity < 0) return fail(res, 400, "Quantity must be 0 or a positive whole number");

  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart?.items.find((i) => String(i.product) === String(productId));
  if (!item) return fail(res, 404, "Item not in cart");

  if (quantity === 0) {
    cart.items = cart.items.filter((i) => String(i.product) !== String(productId));
  } else {
    const product = await Product.findById(productId);
    if (!product || !product.isActive) return fail(res, 404, "Product is no longer available");
    if (quantity > product.maxPerOrder) return fail(res, 400, `You can buy at most ${product.maxPerOrder} per order`);
    if (quantity > product.stock) return fail(res, 409, `Only ${product.stock} left in stock`);
    item.quantity = quantity;
  }
  await cart.save();
  res.json({ success: true, ...(await buildCartView(req.user._id)) });
});

exports.removeCartItem = handle("removeCartItem", async (req, res) => {
  await Cart.updateOne({ user: req.user._id }, { $pull: { items: { product: req.params.productId } } });
  res.json({ success: true, ...(await buildCartView(req.user._id)) });
});

exports.clearCart = handle("clearCart", async (req, res) => {
  await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });
  res.json({ success: true, message: "Cart cleared" });
});

// =====================================================================
// WISHLIST
// =====================================================================

exports.getWishlist = handle("getWishlist", async (req, res) => {
  const wl = await Wishlist.findOne({ user: req.user._id });
  if (!wl || wl.products.length === 0) return res.json({ success: true, products: [] });
  const filter = await store.publicProductFilter();
  const products = await Product.find({ ...filter, _id: { $in: wl.products } }).select(PRODUCT_LIST_FIELDS);
  res.json({ success: true, products: products.map(shapeProduct) });
});

exports.addToWishlist = handle("addToWishlist", async (req, res) => {
  if (!validId(req.params.productId)) return fail(res, 400, "Invalid product id");
  if (!(await Product.exists({ _id: req.params.productId }))) return fail(res, 404, "Product not found");
  await Wishlist.updateOne({ user: req.user._id }, { $addToSet: { products: req.params.productId } }, { upsert: true });
  res.status(201).json({ success: true, message: "Added to wishlist" });
});

exports.removeFromWishlist = handle("removeFromWishlist", async (req, res) => {
  await Wishlist.updateOne({ user: req.user._id }, { $pull: { products: req.params.productId } });
  res.json({ success: true, message: "Removed from wishlist" });
});

// =====================================================================
// ADDRESS BOOK
// =====================================================================

const MAX_ADDRESSES = 10;

const addressInput = (body) => {
  const v = store.validateAddress({ ...body, address: body.line1 || body.address });
  return {
    label: ["home", "work", "other"].includes(body.label) ? body.label : "home",
    name: v.name,
    phone: v.phone,
    line1: String(body.line1 || body.address || "").trim(),
    line2: String(body.line2 || "").trim(),
    landmark: v.landmark,
    city: v.city,
    state: v.state,
    pincode: v.pincode,
  };
};

exports.listAddresses = handle("listAddresses", async (req, res) => {
  const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, updatedAt: -1 });
  res.json({ success: true, addresses });
});

exports.createAddress = handle("createAddress", async (req, res) => {
  const count = await Address.countDocuments({ user: req.user._id });
  if (count >= MAX_ADDRESSES) return fail(res, 400, `You can save up to ${MAX_ADDRESSES} addresses`);
  const data = addressInput(req.body);
  const makeDefault = req.body.isDefault === true || count === 0;
  if (makeDefault) await Address.updateMany({ user: req.user._id }, { $set: { isDefault: false } });
  const address = await Address.create({ ...data, user: req.user._id, isDefault: makeDefault });
  res.status(201).json({ success: true, address });
});

exports.updateAddress = handle("updateAddress", async (req, res) => {
  const address = validId(req.params.id) ? await Address.findOne({ _id: req.params.id, user: req.user._id }) : null;
  if (!address) return fail(res, 404, "Address not found");
  Object.assign(address, addressInput({ ...address.toObject(), ...req.body }));
  if (req.body.isDefault === true) {
    await Address.updateMany({ user: req.user._id, _id: { $ne: address._id } }, { $set: { isDefault: false } });
    address.isDefault = true;
  }
  await address.save();
  res.json({ success: true, address });
});

exports.deleteAddress = handle("deleteAddress", async (req, res) => {
  const address = validId(req.params.id) ? await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id }) : null;
  if (!address) return fail(res, 404, "Address not found");
  if (address.isDefault) {
    const next = await Address.findOne({ user: req.user._id }).sort({ updatedAt: -1 });
    if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
  res.json({ success: true, message: "Address deleted" });
});

// =====================================================================
// COUPONS
// =====================================================================

exports.listCoupons = handle("listCoupons", async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validTo: null }, { validTo: { $gte: now } }] },
    ],
  })
    .select("code description type value maxDiscount minOrderAmount validTo firstOrderOnly")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, coupons });
});

exports.validateCoupon = handle("validateCoupon", async (req, res) => {
  const code = String(req.body.code || "").trim();
  if (!code) return fail(res, 400, "Coupon code is required");

  const cart = await buildCartView(req.user._id);
  if (cart.pricing.subtotal <= 0) return fail(res, 400, "Add products to your cart first");

  const { coupon, discount } = await store.resolveCoupon(req.user._id, code, cart.pricing.subtotal);
  res.json({
    success: true,
    message: `Coupon applied. You save ₹${discount}`,
    code: coupon.code,
    discount,
    description: coupon.description,
  });
});

// =====================================================================
// CHECKOUT
// =====================================================================

/** address from addressId (saved) or inline object */
const resolveAddress = async (req) => {
  const { addressId, shippingAddress } = req.body;
  if (addressId) {
    if (!validId(addressId)) throw httpError(400, "Invalid addressId");
    const a = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!a) throw httpError(404, "Saved address not found");
    return { name: a.name, phone: a.phone, address: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode };
  }
  if (!shippingAddress) throw httpError(400, "Provide addressId or shippingAddress");
  return shippingAddress;
};

/** Lines from `items` (buy-now) or from the server cart */
const resolveRawLines = async (req) => {
  if (Array.isArray(req.body.items) && req.body.items.length) {
    return { source: "items", lines: req.body.items };
  }
  const cart = await Cart.findOne({ user: req.user._id });
  const lines = (cart?.items || []).map((i) => ({ productId: i.product, quantity: i.quantity }));
  return { source: "cart", lines };
};

exports.checkoutPreview = handle("checkoutPreview", async (req, res) => {
  const { lines } = await resolveRawLines(req);
  const loaded = await store.loadLines(lines);
  const paymentMethod = req.body.paymentMethod === "cod" ? "cod" : "online";

  const subtotal = round(loaded.reduce((s, l) => s + l.product.price * l.quantity, 0));
  let discount = 0;
  let couponError = null;
  let appliedCoupon = null;
  if (req.body.couponCode) {
    try {
      const r = await store.resolveCoupon(req.user._id, req.body.couponCode, subtotal);
      discount = r.discount;
      appliedCoupon = r.coupon.code;
    } catch (e) {
      couponError = e.message;
    }
  }

  const pricing = store.computeCheckoutPricing(loaded, { couponDiscount: discount, paymentMethod });
  const c = store.config();
  res.json({
    success: true,
    pricing: {
      subtotal: pricing.subtotal,
      discountAmount: pricing.discountAmount,
      shippingCharge: pricing.shippingCharge,
      codFee: pricing.codFee,
      taxIncluded: pricing.taxAmount,
      grandTotal: pricing.grandTotal,
      itemCount: pricing.itemCount,
      shipments: pricing.orders.length,
    },
    appliedCoupon,
    couponError,
    codAvailable: c.codEnabled && pricing.grandTotal <= c.codMaxAmount,
    codMaxAmount: c.codMaxAmount,
  });
});

exports.checkout = handle("checkout", async (req, res) => {
  const { source, lines } = await resolveRawLines(req);
  const address = await resolveAddress(req);

  const result = await store.placeOrders({
    user: req.user,
    rawLines: lines,
    address,
    couponCode: req.body.couponCode,
    paymentMethod: req.body.paymentMethod,
    note: req.body.note,
  });

  // the purchased lines leave the cart
  if (source === "cart") {
    await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });
  } else {
    await Cart.updateOne(
      { user: req.user._id },
      { $pull: { items: { product: { $in: lines.map((l) => l.productId).filter(validId) } } } }
    );
  }

  res.status(201).json({
    success: true,
    message: result.payment ? "Order created. Complete the payment to confirm it." : "Order placed successfully",
    orderGroup: result.orderGroup,
    paymentRequired: !!result.payment,
    payment: result.payment, // Razorpay checkout data (null for COD)
    totals: {
      subtotal: result.pricing.subtotal,
      discountAmount: result.pricing.discountAmount,
      shippingCharge: result.pricing.shippingCharge,
      codFee: result.pricing.codFee,
      grandTotal: result.pricing.grandTotal,
    },
    orders: result.orders.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmount: o.totalAmount,
      vendor: o.vendor,
    })),
  });
});

exports.retryPayment = handle("retryPayment", async (req, res) => {
  const payment = await store.retryPayment(req.user, req.params.group);
  res.status(201).json({ success: true, payment });
});

// =====================================================================
// ORDERS
// =====================================================================

const orderPopulate = [
  { path: "vendor", select: "name city state phone profileImage" },
];

exports.myOrders = handle("myOrders", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 10);
  const filter = { customer: req.user._id };
  if (req.query.status) filter.status = String(req.query.status);
  const [orders, total] = await Promise.all([
    Order.find(filter).populate(orderPopulate).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), orders });
});

const findMyOrder = async (req) => {
  const key = req.params.id;
  const q = validId(key) ? { _id: key } : { orderNumber: String(key).toUpperCase() };
  return Order.findOne({ ...q, customer: req.user._id });
};

exports.myOrder = handle("myOrder", async (req, res) => {
  const order = await findMyOrder(req);
  if (!order) return fail(res, 404, "Order not found");
  await order.populate(orderPopulate);
  const siblings = order.orderGroup
    ? await Order.find({ orderGroup: order.orderGroup, _id: { $ne: order._id } }).select("orderNumber status totalAmount")
    : [];
  const c = store.config();
  res.json({
    success: true,
    order,
    otherOrdersInCheckout: siblings,
    canCancel: store.canCustomerCancel(order.status),
    canReturn:
      order.status === "delivered" &&
      Date.now() - new Date(order.tracking?.deliveredAt || order.updatedAt).getTime() <= c.returnWindowDays * 86400000,
    canPay: order.status === "awaiting_payment" && (!order.expiresAt || order.expiresAt > new Date()),
  });
});

exports.cancelMyOrder = handle("cancelMyOrder", async (req, res) => {
  const order = await findMyOrder(req);
  if (!order) return fail(res, 404, "Order not found");
  if (!store.canCustomerCancel(order.status)) {
    return fail(res, 400, `Order cannot be cancelled because it is ${order.status}`);
  }
  const updated = await store.cancelOrder(order, { by: "customer", reason: String(req.body.reason || "Cancelled by customer").trim() });
  res.json({
    success: true,
    message: updated.paymentStatus === "refunded" ? "Order cancelled. Refund initiated." : "Order cancelled",
    order: updated,
  });
});

exports.requestReturn = handle("requestReturn", async (req, res) => {
  const order = await findMyOrder(req);
  if (!order) return fail(res, 404, "Order not found");
  const updated = await store.requestReturn(order, req.body);
  res.json({ success: true, message: "Return request submitted", order: updated });
});

exports.reorder = handle("reorder", async (req, res) => {
  const order = await findMyOrder(req);
  if (!order) return fail(res, 404, "Order not found");

  const filter = await store.publicProductFilter();
  const products = await Product.find({ ...filter, _id: { $in: order.items.map((i) => i.product) }, stock: { $gt: 0 } });
  const map = new Map(products.map((p) => [String(p._id), p]));

  const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
  const skipped = [];
  for (const it of order.items) {
    const p = map.get(String(it.product));
    if (!p) {
      skipped.push(it.name);
      continue;
    }
    const existing = cart.items.find((c) => String(c.product) === String(p._id));
    const qty = Math.min(((existing ? existing.quantity : 0) + it.quantity), p.stock, p.maxPerOrder);
    if (existing) existing.quantity = qty;
    else cart.items.push({ product: p._id, quantity: qty });
  }
  await cart.save();
  res.json({ success: true, message: "Items added to cart", skipped, ...(await buildCartView(req.user._id)) });
});

exports.invoice = handle("invoice", async (req, res) => {
  const order = await findMyOrder(req);
  if (!order) return fail(res, 404, "Order not found");
  if (["awaiting_payment", "cancelled"].includes(order.status)) {
    return fail(res, 400, "Invoice is available only for confirmed orders");
  }
  const vendor = await Vendor.findById(order.vendor).select("name address city state phone email");
  res.json({
    success: true,
    invoice: {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      seller: vendor,
      billTo: order.shippingAddress,
      items: order.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.price,
        gstPercent: i.gstPercent,
        gstIncluded: i.taxAmount,
        lineTotal: round(i.price * i.quantity),
      })),
      subtotal: order.subtotal,
      discount: order.discountAmount,
      couponCode: order.couponCode,
      shipping: order.shippingCharge,
      codFee: order.codFee,
      gstIncluded: order.taxAmount,
      total: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    },
  });
});

// =====================================================================
// PRODUCT REVIEWS
// =====================================================================

exports.createReview = handle("createReview", async (req, res) => {
  const productId = req.params.id;
  if (!validId(productId)) return fail(res, 400, "Invalid product id");

  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, "Rating must be between 1 and 5");

  const deliveredOrder = await Order.findOne({
    customer: req.user._id,
    status: "delivered",
    "items.product": productId,
  }).select("_id");
  if (!deliveredOrder) return fail(res, 403, "You can review a product only after it has been delivered to you");

  if (await ProductReview.exists({ product: productId, user: req.user._id })) {
    return fail(res, 409, "You have already reviewed this product. Edit your review instead.");
  }

  const review = await ProductReview.create({
    product: productId,
    user: req.user._id,
    order: deliveredOrder._id,
    rating,
    title: String(req.body.title || "").trim().slice(0, 120),
    comment: String(req.body.comment || "").trim().slice(0, 1500),
    images: (Array.isArray(req.body.images) ? req.body.images : []).slice(0, 4).map(String),
    verifiedPurchase: true,
  });
  await store.recalcProductRating(productId);
  res.status(201).json({ success: true, message: "Thanks for your review", review });
});

exports.updateReview = handle("updateReview", async (req, res) => {
  const review = validId(req.params.reviewId)
    ? await ProductReview.findOne({ _id: req.params.reviewId, user: req.user._id })
    : null;
  if (!review) return fail(res, 404, "Review not found");

  if (req.body.rating !== undefined) {
    const r = Number(req.body.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) return fail(res, 400, "Rating must be between 1 and 5");
    review.rating = r;
  }
  if (req.body.title !== undefined) review.title = String(req.body.title).trim().slice(0, 120);
  if (req.body.comment !== undefined) review.comment = String(req.body.comment).trim().slice(0, 1500);
  await review.save();
  await store.recalcProductRating(review.product);
  res.json({ success: true, review });
});

exports.deleteReview = handle("deleteReview", async (req, res) => {
  const review = validId(req.params.reviewId)
    ? await ProductReview.findOneAndDelete({ _id: req.params.reviewId, user: req.user._id })
    : null;
  if (!review) return fail(res, 404, "Review not found");
  await store.recalcProductRating(review.product);
  res.json({ success: true, message: "Review deleted" });
});

exports._internals = { buildCartView, shapeProduct };
