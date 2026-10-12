
/**
 * Run: npm test
 * Node.js built-in test runner
 */

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

const oid = () => new mongoose.Types.ObjectId();

// 1. Distance calculation
test("haversine: intra-city and Delhi to Mumbai", () => {
  const km = dispatch.haversineKm(
    26.4539, 80.3499,
    26.4414, 80.3649
  );

  assert.ok(km > 1 && km < 3, `got ${km}`);

  const delhiMumbai = dispatch.haversineKm(
    28.6139, 77.209,
    19.076, 72.8777
  );

  assert.ok(
    delhiMumbai > 1100 && delhiMumbai < 1200,
    `got ${delhiMumbai}`
  );
});

// 2. Travel pricing
test("travel charge: free radius then per-km", () => {
  assert.equal(pricing.travelCharge(3), 0);
  assert.equal(pricing.travelCharge(8), 30);
});

// 3. Daily puja schedule
test("daily puja schedule respects weekdays and skipped dates", () => {
  const schedule = daily.buildSchedule({
    startDate: "2026-10-12",
    weekdays: [1, 2, 3, 4, 5],
    count: 6,
  });

  assert.deepEqual(schedule, [
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-19",
  ]);

  const skipped = daily.buildSchedule({
    startDate: "2026-10-12",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    skipDates: ["2026-10-13"],
    count: 3,
  });

  assert.deepEqual(skipped, [
    "2026-10-12",
    "2026-10-14",
    "2026-10-15",
  ]);
});

// 4. Daily puja pricing
test("daily puja pricing and IST date", () => {
  assert.deepEqual(
    daily.priceSubscription({
      pricePerDay: 100,
      planDays: 30,
    }),
    {
      discountPercent: 5,
      totalAmount: 2850,
      perDayNet: 95,
    }
  );

  assert.equal(
    daily.priceSubscription({
      pricePerDay: 100,
      planDays: 5,
    }),
    null
  );

  assert.equal(
    daily.todayIST(Date.UTC(2026, 9, 10, 19, 0, 0)),
    "2026-10-11"
  );
});

// 5. Razorpay checkout signature
test("razorpay checkout signature verifies and rejects tampering", () => {
  const signature = crypto
    .createHmac("sha256", "secret_x")
    .update("order_1|pay_1")
    .digest("hex");

  assert.equal(
    rzp.verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_1",
      signature,
    }),
    true
  );

  assert.equal(
    rzp.verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_2",
      signature,
    }),
    false
  );

  assert.equal(
    rzp.verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "x",
    }),
    false
  );
});

// 6. Razorpay webhook signature
test("razorpay webhook signature uses raw body", () => {
  const raw = Buffer.from(
    JSON.stringify({ event: "payment.captured" })
  );

  const signature = crypto
    .createHmac("sha256", "whsec_x")
    .update(raw)
    .digest("hex");

  assert.equal(
    rzp.verifyWebhookSignature(raw, signature),
    true
  );

  assert.equal(
    rzp.verifyWebhookSignature(Buffer.from("{}"), signature),
    false
  );

  assert.equal(
    rzp.verifyWebhookSignature(null, signature),
    false
  );
});

// 7. InstantRequest schema
test("InstantRequest accepts valid request and rejects bad status", () => {
  const InstantRequest = require("../src/models/InstantRequest");

  const request = new InstantRequest({
    customer: oid(),
    puja: oid(),
    pujaName: "Satyanarayan",
    address: "Civil Lines",
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    pickup: {
      type: "Point",
      coordinates: [80.35, 26.45],
    },
    fare: {
      totalAmount: 500,
    },
  });

  const validError = request.validateSync();

  assert.equal(
    validError,
    undefined,
    validError && validError.message
  );

  request.status = "bogus";

  assert.ok(request.validateSync());
});

// 8. Booking schema
test("Booking created by instant accept, daily puja and mandali is valid", () => {
  const Booking = require("../src/models/Booking");

  const common = {
    customer: oid(),
    vendor: oid(),
    title: "t",
    amount: 100,
    baseAmount: 100,
    totalAmount: 100,
    paymentStatus: "paid",
    status: "confirmed",
  };

  const cases = [
    {
      serviceType: "puja",
      paymentMethod: "cash",
      source: "app",
    },
    {
      serviceType: "puja",
      paymentMethod: "razorpay",
      source: "system",
      metadata: { dailyPuja: true },
    },
    {
      serviceType: "mandali",
      paymentMethod: "razorpay",
      source: "app",
      status: "pending",
      paymentStatus: "pending",
    },
  ];

  for (const extra of cases) {
    const error = new Booking({
      ...common,
      ...extra,
    }).validateSync();

    assert.equal(
      error,
      undefined,
      error && error.message
    );
  }
});

// 9. Daily puja subscription and payment schemas
test("DailyPujaSubscription and Payment schemas validate", () => {
  const Subscription = require("../src/models/DailyPujaSubscription");
  const Payment = require("../src/models/Payment");

  const subscription = new Subscription({
    customer: oid(),
    vendor: oid(),
    puja: oid(),
    devoteeName: "Ravi",
    timeOfDay: "06:30",
    startDate: "2026-10-12",
    planDays: 30,
    pricePerDay: 100,
    totalAmount: 2850,
  });

  const subscriptionError = subscription.validateSync();

  assert.equal(
    subscriptionError,
    undefined,
    subscriptionError && subscriptionError.message
  );

  const payment = new Payment({
    user: oid(),
    purpose: "wallet_topup",
    amount: 100,
    razorpayOrderId: "order_1",
  });

  const paymentError = payment.validateSync();

  assert.equal(
    paymentError,
    undefined,
    paymentError && paymentError.message
  );

  const invalidPayment = new Payment({
    user: oid(),
    purpose: "nope",
    amount: 100,
    razorpayOrderId: "o",
  });

  assert.ok(invalidPayment.validateSync());
});

// 10. Earning schema
test("Earning schema accepts earningService data", () => {
  const Earning = require("../src/models/Earning");

  const error = new Earning({
    vendor: oid(),
    user: oid(),
    booking: oid(),
    serviceType: "pandit",
    grossAmount: 1000,
    commissionPercentage: 15,
    commissionAmount: 150,
    netAmount: 850,
    status: "available",
    transactionReference: "BOOKING-x",
    metadata: {
      settlement: "cash_collected_by_vendor",
    },
  }).validateSync();

  assert.equal(error, undefined, error && error.message);
});

// 11. Rate limiter
test("rate limiter blocks after max and sets Retry-After", () => {
  const rateLimit = require("../src/middleware/rateLimit");

  const limiter = rateLimit({
    windowMs: 1000,
    max: 2,
  });

  const req = {
    baseUrl: "/x",
    path: "/y",
    ip: "1.1.1.1",
  };

  let status = null;
  const headers = {};
  let passed = 0;

  const res = {
    set: (key, value) => {
      headers[key] = value;
    },
    status: (code) => ({
      json: () => {
        status = code;
      },
    }),
  };

  for (let i = 0; i < 3; i++) {
    limiter(req, res, () => {
      passed++;
    });
  }

  assert.equal(passed, 2);
  assert.equal(status, 429);
  assert.ok(headers["Retry-After"]);
});
