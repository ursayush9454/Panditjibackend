const mongoose = require("mongoose");
const DailyPujaSubscription = require("../models/DailyPujaSubscription");
const Booking = require("../models/Booking");
const Vendor = require("../models/Vendor");
const Puja = require("../models/Puja");
const PanditPujaService = require("../models/PanditPujaService");
const { creditWallet } = require("../services/walletService");
const svc = require("../services/dailyPujaService");
const { computePujaFare, round } = require("../services/pricingService");

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error(`${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

// GET /daily-puja/plans  -> plan options + daily pujas catalog
exports.getPlans = handle("getPlans", async (req, res) => {
  const pujas = await Puja.find({ category: "daily", isActive: true })
    .select("name slug shortDescription basePrice durationMinutes image benefits")
    .sort({ sortOrder: 1, name: 1 });
  res.json({ success: true, plans: svc.PLANS, pujas });
});

// POST /daily-puja   -> creates a subscription awaiting payment
exports.create = handle("create", async (req, res) => {
  const {
    pujaId, panditServiceId, vendorId, mode = "home", devoteeName, gotra = "", sankalp = "",
    address = "", city = "", pincode = "", timeOfDay, startDate, planDays,
  } = req.body;
  let weekdays = req.body.weekdays;

  if (!mongoose.isValidObjectId(pujaId)) return fail(res, 400, "Valid pujaId is required");
  if (!mongoose.isValidObjectId(vendorId)) return fail(res, 400, "Valid vendorId (pandit) is required");
  if (!devoteeName || !String(devoteeName).trim()) return fail(res, 400, "devoteeName is required");
  if (!svc.isTime(timeOfDay)) return fail(res, 400, "timeOfDay must be HH:mm");
  if (!svc.isDate(startDate)) return fail(res, 400, "startDate must be YYYY-MM-DD");
  if (startDate <= svc.todayIST()) return fail(res, 400, "startDate must be tomorrow or later");
  if (!["home", "temple"].includes(mode)) return fail(res, 400, "mode must be home or temple");
  if (mode === "home" && !String(address).trim()) return fail(res, 400, "Address is required for home mode");

  weekdays = Array.isArray(weekdays) && weekdays.length ? weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6];
  if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return fail(res, 400, "weekdays must be 0-6");

  const vendor = await Vendor.findOne({ _id: vendorId, role: "pandit", status: "approved" });
  if (!vendor) return fail(res, 404, "Approved pandit not found");

  // price comes from the server, never from the client
  const { breakdown, puja } = await computePujaFare({ pujaId, panditServiceId });
  if (panditServiceId) {
    const owns = await PanditPujaService.exists({ _id: panditServiceId, pandit: vendor._id });
    if (!owns) return fail(res, 400, "This service does not belong to the selected pandit");
  }
  const pricing = svc.priceSubscription({ pricePerDay: breakdown.pujaPrice, planDays: Number(planDays) });
  if (!pricing) return fail(res, 400, `planDays must be one of ${svc.PLANS.map((p) => p.days).join(", ")}`);
  if (!(pricing.totalAmount > 0)) return fail(res, 400, "This puja has no price configured");

  const sub = await DailyPujaSubscription.create({
    customer: req.user._id,
    vendor: vendor._id,
    puja: puja._id,
    pujaName: puja.name,
    panditService: panditServiceId || null,
    mode,
    devoteeName: String(devoteeName).trim(),
    gotra,
    sankalp,
    address,
    city,
    pincode,
    timeOfDay,
    startDate,
    weekdays,
    planDays: Number(planDays),
    pricePerDay: breakdown.pujaPrice,
    discountPercent: pricing.discountPercent,
    totalAmount: pricing.totalAmount,
  });

  const schedule = svc.buildSchedule({ startDate, weekdays, count: sub.planDays });
  res.status(201).json({
    success: true,
    message: "Subscription created. Complete payment to activate.",
    subscription: sub,
    endDate: schedule[schedule.length - 1],
    payWith: { endpoint: "/api/partner/payments/orders", body: { purpose: "daily_puja", subscriptionId: sub._id } },
  });
});

exports.my = handle("my", async (req, res) => {
  const subs = await DailyPujaSubscription.find({ customer: req.user._id })
    .populate("vendor", "name profileImage city")
    .sort({ createdAt: -1 });
  res.json({ success: true, subscriptions: subs });
});

const loadOwn = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 400, "Invalid subscription ID");
    return null;
  }
  const sub = await DailyPujaSubscription.findOne({ _id: req.params.id, customer: req.user._id });
  if (!sub) fail(res, 404, "Subscription not found");
  return sub;
};

exports.getOne = handle("getOne", async (req, res) => {
  const sub = await loadOwn(req, res);
  if (!sub) return;
  const schedule = svc.buildSchedule({
    startDate: sub.startDate, weekdays: sub.weekdays, skipDates: sub.skipDates, count: sub.planDays,
  });
  const bookings = await Booking.find({ "metadata.subscription": String(sub._id) })
    .select("scheduledDate startTime status")
    .sort({ scheduledDate: 1 });
  res.json({ success: true, subscription: sub, endDate: schedule[schedule.length - 1], bookings });
});

// POST /daily-puja/:id/skip  { dates: ["YYYY-MM-DD", ...] }  or { from, to }
exports.skip = handle("skip", async (req, res) => {
  const sub = await loadOwn(req, res);
  if (!sub) return;
  if (sub.status !== "active") return fail(res, 409, "Only active subscriptions can be changed");

  let dates = req.body.dates;
  if (!dates && req.body.from && req.body.to) {
    dates = [];
    for (let d = req.body.from; d <= req.body.to && dates.length < 60; d = svc.addDays(d, 1)) dates.push(d);
  }
  if (!Array.isArray(dates) || !dates.length || !dates.every(svc.isDate)) {
    return fail(res, 400, "Provide valid dates (YYYY-MM-DD)");
  }
  const today = svc.todayIST();
  const tooSoon = dates.filter((d) => d <= today || sub.generatedDates.includes(d));
  if (tooSoon.length) {
    return fail(res, 409, "Pujas already scheduled can not be skipped. Cancel that booking instead.", { dates: tooSoon });
  }

  sub.skipDates = [...new Set([...sub.skipDates, ...dates])].sort();
  await sub.save();
  const schedule = svc.buildSchedule({
    startDate: sub.startDate, weekdays: sub.weekdays, skipDates: sub.skipDates, count: sub.planDays,
  });
  res.json({ success: true, message: "Skipped. Your plan end date has been extended.", endDate: schedule[schedule.length - 1], subscription: sub });
});

// PUT /daily-puja/:id/cancel  -> refunds the not-yet-scheduled days to the wallet
exports.cancel = handle("cancel", async (req, res) => {
  const sub = await loadOwn(req, res);
  if (!sub) return;
  if (!["active", "pending_payment"].includes(sub.status)) return fail(res, 409, "Subscription cannot be cancelled");

  const wasActive = sub.status === "active";
  const claimed = await DailyPujaSubscription.findOneAndUpdate(
    { _id: sub._id, status: sub.status },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: String(req.body.reason || "").slice(0, 300) } },
    { new: true }
  );
  if (!claimed) return fail(res, 409, "Subscription already changed");

  // cancel scheduled-but-not-started bookings from tomorrow on, today's stays
  const today = svc.todayIST();
  await Booking.updateMany(
    { "metadata.subscription": String(sub._id), status: "confirmed", scheduledDate: { $gt: today } },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancellationReason: "Subscription cancelled" } }
  );

  let refund = 0;
  if (wasActive) {
    const kept = await Booking.countDocuments({
      "metadata.subscription": String(sub._id),
      status: { $in: ["confirmed", "in_progress", "completed"] },
    });
    const perDay = round(sub.totalAmount / sub.planDays);
    refund = round(Math.max(0, sub.totalAmount - perDay * kept));
    if (refund > 0) {
      await creditWallet({
        userId: sub.customer,
        amount: refund,
        category: "refund",
        referenceId: `DAILY-REFUND-${sub._id}`,
        description: `Refund for cancelled daily puja (${sub.pujaName})`,
      });
      claimed.refundedAmount = refund;
      await claimed.save();
    }
  }
  res.json({ success: true, message: "Subscription cancelled", refundedToWallet: refund });
});

// ---------- pandit ----------
exports.panditToday = handle("panditToday", async (req, res) => {
  const vendor = await Vendor.findOne({ user: req.user._id, role: "pandit" });
  if (!vendor) return fail(res, 403, "Pandit profile required");
  const date = svc.isDate(req.query.date) ? req.query.date : svc.todayIST();
  const bookings = await Booking.find({
    vendor: vendor._id,
    "metadata.dailyPuja": true,
    scheduledDate: date,
    status: { $in: ["confirmed", "in_progress", "completed"] },
  }).sort({ startTime: 1 });
  res.json({ success: true, date, count: bookings.length, bookings });
});
