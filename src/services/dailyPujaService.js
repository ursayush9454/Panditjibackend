const DailyPujaSubscription = require("../models/DailyPujaSubscription");
const Booking = require("../models/Booking");
const Vendor = require("../models/Vendor");
const { notifyUser } = require("./notificationService");
const { config, round } = require("./pricingService");

// ---------- pure helpers (unit tested) ----------

const PLANS = [
  { days: 7, discountPercent: 0 },
  { days: 30, discountPercent: 5 },
  { days: 90, discountPercent: 10 },
  { days: 365, discountPercent: 15 },
];

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const todayIST = (now = Date.now()) => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * The first `count` dates starting at startDate that fall on an allowed weekday
 * and are not skipped. Skipping a day therefore automatically extends the end date,
 * so the customer never loses a paid puja.
 */
const buildSchedule = ({ startDate, weekdays, skipDates = [], count }) => {
  if (!weekdays.length) return [];
  const skip = new Set(skipDates);
  const out = [];
  let d = startDate;
  let guard = 0;
  while (out.length < count && guard < 5000) {
    if (weekdays.includes(weekdayOf(d)) && !skip.has(d)) out.push(d);
    d = addDays(d, 1);
    guard += 1;
  }
  return out;
};

const planDiscount = (days) => (PLANS.find((p) => p.days === days) || {}).discountPercent;

const priceSubscription = ({ pricePerDay, planDays }) => {
  const discountPercent = planDiscount(planDays);
  if (discountPercent === undefined) return null;
  const gross = pricePerDay * planDays;
  const totalAmount = round(gross - (gross * discountPercent) / 100);
  return { discountPercent, totalAmount, perDayNet: round(totalAmount / planDays) };
};

// ---------- DB operations ----------

const activateSubscription = async (subscriptionId, paymentId) => {
  const sub = await DailyPujaSubscription.findOneAndUpdate(
    { _id: subscriptionId, status: "pending_payment" },
    { $set: { status: "active", payment: paymentId, activatedAt: new Date() } },
    { new: true }
  );
  if (!sub) return null;

  const vendor = await Vendor.findById(sub.vendor).select("user name");
  try {
    await notifyUser({
      userId: sub.customer,
      title: "Daily puja activated",
      message: `${sub.pujaName} will be performed daily from ${sub.startDate}.`,
      type: "booking_accepted",
      referenceId: sub._id,
      referenceType: "daily_puja",
    });
    if (vendor) {
      await notifyUser({
        userId: vendor.user,
        title: "New daily puja subscription",
        message: `${sub.pujaName} • ${sub.planDays} days • from ${sub.startDate} at ${sub.timeOfDay}`,
        type: "job_created",
        referenceId: sub._id,
        referenceType: "daily_puja",
      });
    }
  } catch (_) {}

  await generateForSubscription(sub);
  return sub;
};

const createBookingForDate = async (sub, vendor, date) => {
  const base = round(sub.totalAmount / sub.planDays);
  const pct =
    vendor.commissionPercentage !== null && vendor.commissionPercentage !== undefined
      ? vendor.commissionPercentage
      : config().commissionPercent;
  const commissionAmount = round((base * pct) / 100);

  return Booking.create({
    customer: sub.customer,
    vendor: sub.vendor,
    serviceType: "puja",
    title: `${sub.pujaName} (Daily)`,
    description: sub.sankalp || "",
    puja: sub.puja,
    pujaName: sub.pujaName,
    panditPujaService: sub.panditService || null,
    scheduledDate: date,
    startTime: sub.timeOfDay,
    address: sub.address,
    city: sub.city,
    pincode: sub.pincode,
    amount: base,
    baseAmount: base,
    totalAmount: base,
    commissionPercentage: pct,
    commissionAmount,
    vendorAmount: round(base - commissionAmount),
    paymentMethod: "razorpay",
    paymentStatus: "paid", // prepaid through the subscription
    paidAt: new Date(),
    status: "confirmed",
    confirmedAt: new Date(),
    source: "system",
    customerNotes: `Devotee: ${sub.devoteeName}${sub.gotra ? `, Gotra: ${sub.gotra}` : ""}`,
    metadata: { subscription: String(sub._id), dailyPuja: true, mode: sub.mode, devoteeName: sub.devoteeName, gotra: sub.gotra },
  });
};

/**
 * Creates bookings for the next `horizonDays` days. Duplicate-safe across instances:
 * a date is claimed with an atomic $addToSet before the booking is written.
 */
const generateForSubscription = async (sub, horizonDays = 2) => {
  const vendor = await Vendor.findById(sub.vendor).select("user name commissionPercentage status");
  if (!vendor || vendor.status !== "approved") return 0;

  const schedule = buildSchedule({
    startDate: sub.startDate,
    weekdays: sub.weekdays,
    skipDates: sub.skipDates,
    count: sub.planDays,
  });
  const today = todayIST();
  const limit = addDays(today, horizonDays - 1);
  let created = 0;

  for (const date of schedule) {
    if (date < today || date > limit) continue;
    const claimed = await DailyPujaSubscription.findOneAndUpdate(
      { _id: sub._id, status: "active", generatedDates: { $ne: date } },
      { $addToSet: { generatedDates: date } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      const booking = await createBookingForDate(sub, vendor, date);
      created += 1;
      await notifyUser({
        userId: vendor.user,
        title: "Daily puja scheduled",
        message: `${sub.pujaName} on ${date} at ${sub.timeOfDay}`,
        type: "booking_created",
        referenceId: booking._id,
        referenceType: "booking",
      }).catch(() => {});
    } catch (e) {
      console.error("Daily puja booking failed:", e.message);
      await DailyPujaSubscription.updateOne({ _id: sub._id }, { $pull: { generatedDates: date } });
    }
  }
  return created;
};

const sweep = async () => {
  const today = todayIST();

  // unpaid subscriptions expire after 24h
  await DailyPujaSubscription.updateMany(
    { status: "pending_payment", createdAt: { $lte: new Date(Date.now() - 24 * 3600 * 1000) } },
    { $set: { status: "expired" } }
  );

  const active = await DailyPujaSubscription.find({ status: "active" });
  for (const sub of active) {
    await generateForSubscription(sub);

    const schedule = buildSchedule({
      startDate: sub.startDate,
      weekdays: sub.weekdays,
      skipDates: sub.skipDates,
      count: sub.planDays,
    });
    const last = schedule[schedule.length - 1];
    if (last && last < today) {
      await DailyPujaSubscription.updateOne({ _id: sub._id, status: "active" }, { $set: { status: "completed" } });
    }
  }
};

let timer = null;
const startDailyPujaScheduler = () => {
  if (timer) return;
  sweep().catch((e) => console.error("Daily puja sweep error:", e.message));
  timer = setInterval(() => {
    sweep().catch((e) => console.error("Daily puja sweep error:", e.message));
  }, 30 * 60 * 1000);
  timer.unref?.();
};

module.exports = {
  PLANS,
  todayIST,
  addDays,
  isDate,
  isTime,
  weekdayOf,
  buildSchedule,
  priceSubscription,
  activateSubscription,
  generateForSubscription,
  startDailyPujaScheduler,
  sweep,
};
