// Run: npm test   (no database needed - tests pure logic, schemas and route wiring)
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STORE_SHIPPING_CHARGE = "49";
process.env.STORE_FREE_SHIPPING_ABOVE = "499";
process.env.STORE_COD_FEE = "20";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const store = require("../src/services/storeService");
const { sanitizeProductInput } = require("../src/services/productInput");
const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const Coupon = require("../src/models/Coupon");
const Cart = require("../src/models/Cart");
const Payment = require("../src/models/Payment");

const oid = () => new mongoose.Types.ObjectId();
const prod = (over = {}) => ({ _id: oid(), vendor: oid(), name: "Item", price: 100, mrp: 120, gstPercent: 5, stock: 10, ...over });

// ------------------------------------------------------------------ pricing

test("pricing: single vendor, shipping charged below free-shipping threshold", () => {
  const p = prod({ price: 200 });
  const r = store.computeCheckoutPricing([{ product: p, quantity: 1 }]);
  assert.equal(r.subtotal, 200);
  assert.equal(r.shippingCharge, 49);
  assert.equal(r.grandTotal, 249);
  assert.equal(r.orders.length, 1);
});

test("pricing: free shipping at/above threshold, GST is included not added", () => {
  const p = prod({ price: 250, gstPercent: 5 });
  const r = store.computeCheckoutPricing([{ product: p, quantity: 2 }]); // 500
  assert.equal(r.shippingCharge, 0);
  assert.equal(r.grandTotal, 500);
  assert.equal(r.taxAmount, 23.81); // 500 * 5 / 105
});

test("pricing: two merchants become two shipments with their own shipping", () => {
  const a = prod({ price: 300 });
  const b = prod({ price: 600 });
  const r = store.computeCheckoutPricing([{ product: a, quantity: 1 }, { product: b, quantity: 1 }]);
  assert.equal(r.orders.length, 2);
  const oa = r.orders.find((o) => String(o.vendor) === String(a.vendor));
  const ob = r.orders.find((o) => String(o.vendor) === String(b.vendor));
  assert.equal(oa.shippingCharge, 49);
  assert.equal(ob.shippingCharge, 0);
  assert.equal(r.grandTotal, 300 + 49 + 600);
});

test("pricing: coupon discount is split across vendors and sums exactly", () => {
  const a = prod({ price: 333 });
  const b = prod({ price: 667 });
  const r = store.computeCheckoutPricing([{ product: a, quantity: 1 }, { product: b, quantity: 1 }], { couponDiscount: 100 });
  const sum = r.orders.reduce((s, o) => s + o.discountAmount, 0);
  assert.equal(Math.round(sum * 100) / 100, 100);
  assert.equal(r.discountAmount, 100);
});

test("pricing: discount can never exceed subtotal; COD fee only for COD", () => {
  const p = prod({ price: 100 });
  const online = store.computeCheckoutPricing([{ product: p, quantity: 1 }], { couponDiscount: 5000 });
  assert.equal(online.discountAmount, 100);
  assert.equal(online.codFee, 0);
  const cod = store.computeCheckoutPricing([{ product: p, quantity: 1 }], { paymentMethod: "cod" });
  assert.equal(cod.codFee, 20);
  assert.equal(cod.grandTotal, 100 + 49 + 20);
});

test("pricing: same vendor lines merge into one order", () => {
  const v = oid();
  const r = store.computeCheckoutPricing([
    { product: prod({ vendor: v, price: 100 }), quantity: 2 },
    { product: prod({ vendor: v, price: 50 }), quantity: 3 },
  ]);
  assert.equal(r.orders.length, 1);
  assert.equal(r.orders[0].items.length, 2);
  assert.equal(r.subtotal, 350);
  assert.equal(r.itemCount, 5);
});

// ------------------------------------------------------------------ coupons

const coupon = (over = {}) => ({ code: "T10", isActive: true, type: "percent", value: 10, maxDiscount: 0, minOrderAmount: 0, usageLimit: 0, usedCount: 0, perUserLimit: 1, firstOrderOnly: false, ...over });

test("coupon: percent with cap, flat, and capped by subtotal", () => {
  assert.equal(store.evaluateCoupon(coupon({ maxDiscount: 30 }), { subtotal: 1000 }).discount, 30);
  assert.equal(store.evaluateCoupon(coupon(), { subtotal: 1000 }).discount, 100);
  assert.equal(store.evaluateCoupon(coupon({ type: "flat", value: 500 }), { subtotal: 300 }).discount, 300);
});

test("coupon: rejects expired, not started, exhausted, per-user, first-order and min-amount", () => {
  const now = new Date("2026-06-15");
  assert.match(store.evaluateCoupon(coupon({ validTo: new Date("2026-06-01") }), { subtotal: 500, now }).reason, /expired/);
  assert.match(store.evaluateCoupon(coupon({ validFrom: new Date("2026-07-01") }), { subtotal: 500, now }).reason, /not active/);
  assert.match(store.evaluateCoupon(coupon({ usageLimit: 5, usedCount: 5 }), { subtotal: 500 }).reason, /fully redeemed/);
  assert.match(store.evaluateCoupon(coupon(), { subtotal: 500, userUses: 1 }).reason, /already used/);
  assert.match(store.evaluateCoupon(coupon({ firstOrderOnly: true }), { subtotal: 500, userOrders: 2 }).reason, /first order/);
  assert.match(store.evaluateCoupon(coupon({ minOrderAmount: 600 }), { subtotal: 500 }).reason, /₹100/);
  assert.equal(store.evaluateCoupon(null, { subtotal: 500 }).valid, false);
  assert.equal(store.evaluateCoupon(coupon({ isActive: false }), { subtotal: 500 }).valid, false);
});

// ------------------------------------------------------------------ settlement

test("settlement: commission on subtotal, shipping goes to the merchant", () => {
  const s = store.computeSettlement({ subtotal: 1000, discountAmount: 100, shippingCharge: 49, couponFundedBy: "platform" }, 10);
  assert.equal(s.commissionAmount, 100);
  assert.equal(s.vendorAmount, 949); // 1000 - 100 + 49
});

test("settlement: vendor-funded coupon reduces the commission base", () => {
  const s = store.computeSettlement({ subtotal: 1000, discountAmount: 100, shippingCharge: 0, couponFundedBy: "vendor" }, 10);
  assert.equal(s.base, 900);
  assert.equal(s.vendorAmount, 810);
});

// ------------------------------------------------------------------ order flow rules

test("status machine: merchant transitions", () => {
  assert.ok(store.canMerchantTransition("pending", "confirmed"));
  assert.ok(store.canMerchantTransition("confirmed", "shipped"));
  assert.ok(store.canMerchantTransition("out_for_delivery", "delivered"));
  assert.ok(!store.canMerchantTransition("pending", "delivered"));
  assert.ok(!store.canMerchantTransition("shipped", "cancelled"));
  assert.ok(!store.canMerchantTransition("delivered", "pending"));
});

test("customers can cancel only before shipping", () => {
  ["awaiting_payment", "pending", "confirmed", "processing"].forEach((s) => assert.ok(store.canCustomerCancel(s), s));
  ["shipped", "out_for_delivery", "delivered", "cancelled", "returned"].forEach((s) => assert.ok(!store.canCustomerCancel(s), s));
});

// ------------------------------------------------------------------ address

test("address validation", () => {
  const good = { name: "Ravi Kumar", phone: "+91 98765 43210", address: "12 MG Road", city: "Kanpur", state: "Uttar Pradesh", pincode: "208001" };
  const v = store.validateAddress(good);
  assert.equal(v.phone, "9876543210");
  assert.throws(() => store.validateAddress({ ...good, phone: "12345" }), /mobile/);
  assert.throws(() => store.validateAddress({ ...good, pincode: "0123" }), /pincode/);
  assert.throws(() => store.validateAddress({ ...good, name: "" }), /name/);
  assert.throws(() => store.validateAddress({ ...good, city: "" }), /City/);
  assert.equal(store.normalizePhone("09876543210"), "9876543210");
});

// ------------------------------------------------------------------ product input

test("product input: accepts a good product, rejects bad values", () => {
  const ok = sanitizeProductInput({ name: "Havan Samagri", price: 120, mrp: 150, stock: 5, tags: "havan, pooja", isKit: true, kitItems: [{ name: "Ghee", quantity: "100 ml" }] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.data.tags, ["havan", "pooja"]);
  assert.equal(ok.data.isKit, true);

  assert.ok(sanitizeProductInput({ name: "A", price: 10 }).errors.length);
  assert.ok(sanitizeProductInput({ name: "Valid", price: -5 }).errors.length);
  assert.ok(sanitizeProductInput({ name: "Valid", price: 50, mrp: 40 }).errors.length);
  assert.ok(sanitizeProductInput({ name: "Valid", price: 50, stock: 1.5 }).errors.length);
  assert.ok(sanitizeProductInput({ name: "Valid", price: 50, image: "javascript:alert(1)" }).errors.length);
  assert.deepEqual(sanitizeProductInput({ stock: 3 }, { partial: true }).errors, []);
});

// ------------------------------------------------------------------ schemas

test("Order schema accepts what placeOrders writes and rejects bad status", () => {
  const base = {
    orderNumber: store.genOrderNumber(),
    orderGroup: "GRP-1",
    customer: oid(),
    vendor: oid(),
    items: [{ product: oid(), name: "X", quantity: 2, price: 100, gstPercent: 5, taxAmount: 9.52 }],
    subtotal: 200,
    totalAmount: 249,
    shippingCharge: 49,
    status: "awaiting_payment",
    paymentMethod: "online",
    shippingAddress: { name: "A", phone: "9876543210", address: "x", city: "c", state: "s", pincode: "208001" },
  };
  assert.equal(new Order(base).validateSync(), undefined);
  assert.ok(new Order({ ...base, status: "teleported" }).validateSync());
  assert.ok(new Order({ ...base, items: [] }).validateSync());
  // cancelReason is a top-level field now (it used to be nested in shippingAddress by mistake)
  const o = new Order({ ...base, cancelReason: "changed my mind" });
  assert.equal(o.cancelReason, "changed my mind");
});

test("Product / Coupon / Cart / Payment schemas", () => {
  assert.equal(new Product({ vendor: oid(), name: "P", price: 10, mrp: 20 }).discountPercent, 50);
  assert.ok(new Product({ vendor: oid(), name: "P", price: -1 }).validateSync());
  assert.equal(new Coupon({ code: "abc", type: "flat", value: 5 }).code, "ABC");
  assert.ok(new Coupon({ code: "X", type: "weird", value: 5 }).validateSync());
  assert.ok(new Cart({ user: oid(), items: [{ product: oid(), quantity: 0 }] }).validateSync());
  assert.equal(new Payment({ user: oid(), purpose: "store_order", orderGroup: "GRP-1", amount: 249, razorpayOrderId: "order_1" }).validateSync(), undefined);
});

// ------------------------------------------------------------------ route wiring (no DB needed)

test("routes are mounted and protected", async () => {
  const http = require("node:http");
  const app = require("../src/app");
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/partner`;

  try {
    const status = async (method, path) => (await fetch(base + path, { method })).status;
    assert.equal(await status("GET", "/store/cart"), 401);
    assert.equal(await status("POST", "/store/checkout"), 401);
    assert.equal(await status("GET", "/store/orders"), 401);
    assert.equal(await status("GET", "/store/admin/stats"), 401);
    assert.equal(await status("GET", "/merchant/dashboard"), 401);
    assert.equal(await status("PUT", "/merchant/products/stock"), 401);
    assert.equal(await status("GET", "/store/nope"), 401); // unknown paths under the authed router
    assert.equal(await status("GET", "/totally-unknown"), 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
