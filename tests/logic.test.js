// Run: npm test   (uses Node's built-in test runner, no extra dependencies)
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.RAZORPAY_KEY_ID = "rzp_test_x";
process.env.RAZORPAY_KEY_SECRET = "secret_x";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_x";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

const daily = require("../src/services/dailyPujaService");
const dispatch = require("../src/services/dispatchService");
const pricing = require("../src/services/pricingService");
const rzp = require("../src/services/razorpayService");

test("haversine: short intra-city distance and Delhi -> Mumbai sanity check", () => {
  const km = dispatch.haversineKm(26.4539, 80.3499, 26.4414, 80.3649);
  assert.ok(km > 1 && km < 3, `got ${km}`); // sanity: same city
  const delhiMumbai = dispatch.haversineKm(28.6139, 77.209, 19.076, 72.8777);
  assert.ok(delhiMumbai > 1100 && delhiMumbai < 1200, `got ${delhiMumbai}`);
});

test("travel charge: free radius then per-km", () => {
  assert.equal(pricing.travelCharge(3), 0);
  assert.equal(pricing.travelCharge(8), 30); // (8-5) * 10
});

test("daily puja schedule respects weekdays and skips (skips extend the plan)", () => {
  const mf = daily.buildSchedule({ startDate: "2026-10-12", weekdays: [1, 2, 3, 4, 5], count: 6 });
  assert.deepEqual(mf, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"]);
  const skipped = daily.buildSchedule({ startDate: "2026-10-12", weekdays: [0, 1, 2, 3, 4, 5, 6], skipDates: ["2026-10-13"], count: 3 });
  assert.deepEqual(skipped, ["2026-10-12", "2026-10-14", "2026-10-15"]);
});

test("daily puja pricing: plan discounts and invalid plans", () => {
  assert.deepEqual(daily.priceSubscription({ pricePerDay: 100, planDays: 30 }), { discountPercent: 5, totalAmount: 2850, perDayNet: 95 });
  assert.equal(daily.priceSubscription({ pricePerDay: 100, planDays: 5 }), null);
  assert.equal(daily.todayIST(Date.UTC(2026, 9, 10, 19, 0, 0)), "2026-10-11"); // 00:30 IST next day
});

test("razorpay checkout signature verifies and rejects tampering", () => {
  const sig = crypto.createHmac("sha256", "secret_x").update("order_1|pay_1").digest("hex");
  assert.equal(rzp.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig }), true);
  assert.equal(rzp.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature: sig }), false);
  assert.equal(rzp.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "x" }), false);
});

test("razorpay webhook signature uses the raw body", () => {
  const raw = Buffer.from(JSON.stringify({ event: "payment.captured" }));
  const sig = crypto.createHmac("sha256", "whsec_x").update(raw).digest("hex");
  assert.equal(rzp.verifyWebhookSignature(raw, sig), true);
  assert.equal(rzp.verifyWebhookSignature(Buffer.from("{}"), sig), false);
  assert.equal(rzp.verifyWebhookSignature(null, sig), false);
});

// ---- schema validation (no DB needed) -------------------------------------
const oid = () => new mongoose.Types.ObjectId();

test("InstantRequest schema accepts a valid request and rejects bad status", () => {
  const InstantRequest = require("../src/models/InstantRequest");
  const ok = new InstantRequest({
    customer: oid(), puja: oid(), pujaName: "Satyanarayan", address: "Civil Lines",
    pickup: { type: "Point", coordinates: [80.35, 26.45] }, fare: { totalAmount: 500 },
    scheduledAt: new Date(Date.now() + 3600000),
  });
  assert.equal(ok.validateSync(), undefined);
  ok.status = "bogus";
  assert.ok(ok.validateSync());
});

test("Booking created by instant accept / daily puja / mandali is schema-valid", () => {
  const Booking = require("../src/models/Booking");
  const common = { customer: oid(), vendor: oid(), title: "t", amount: 100, baseAmount: 100, totalAmount: 100, paymentStatus: "paid", status: "confirmed" };
  for (const extra of [
    { serviceType: "puja", paymentMethod: "cash", source: "app" },
    { serviceType: "puja", paymentMethod: "razorpay", source: "system", metadata: { dailyPuja: true } },
    { serviceType: "mandali", paymentMethod: "razorpay", source: "app", status: "pending", paymentStatus: "pending" },
  ]) {
    const err = new Booking({ ...common, ...extra }).validateSync();
    assert.equal(err, undefined, err && err.message);
  }
});

test("DailyPujaSubscription and Payment schemas validate", () => {
  const Sub = require("../src/models/DailyPujaSubscription");
  const Payment = require("../src/models/Payment");
  assert.equal(new Sub({
    customer: oid(), vendor: oid(), puja: oid(), devoteeName: "Ravi", timeOfDay: "06:30",
    startDate: "2026-10-12", planDays: 30, pricePerDay: 100, totalAmount: 2850,
  }).validateSync(), undefined);
  assert.equal(new Payment({ user: oid(), purpose: "wallet_topup", amount: 100, razorpayOrderId: "order_1" }).validateSync(), undefined);
  assert.ok(new Payment({ user: oid(), purpose: "nope", amount: 100, razorpayOrderId: "o" }).validateSync());
});

test("Earning schema accepts what earningService writes", () => {
  const Earning = require("../src/models/Earning");
  const err = new Earning({
    vendor: oid(), user: oid(), booking: oid(), serviceType: "pandit", grossAmount: 1000,
    commissionPercentage: 15, commissionAmount: 150, netAmount: 850, status: "available",
    transactionReference: "BOOKING-x", metadata: { settlement: "cash_collected_by_vendor" },
  }).validateSync();
  assert.equal(err, undefined, err && err.message);
});

test("rate limiter blocks after max and sets Retry-After", () => {
  const rl = require("../src/middleware/rateLimit")({ windowMs: 1000, max: 2 });
  const req = { baseUrl: "/x", path: "/y", ip: "1.1.1.1" };
  let status = null, headers = {};
  const res = { set: (k, v) => (headers[k] = v), status: (s) => ({ json: () => (status = s) }) };
  let passed = 0;
  for (let i = 0; i < 3; i++) rl(req, res, () => passed++);
  assert.equal(passed, 2);
  assert.equal(status, 429);
  assert.ok(headers["Retry-After"]);
});
