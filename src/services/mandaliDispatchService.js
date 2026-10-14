
const mongoose = require("mongoose");
const MandaliDispatch = require("../models/MandaliDispatch");
const Inquiry = require("../models/Inquiry");
const { notifyUser } = require("./notificationService");

const OFFER_TIMEOUT_SECONDS = 120;
const SWEEP_INTERVAL_MS = 5000;
let sweepTimer = null;
let sweepRunning = false;

const notifySafely = async (payload) => {
  try {
    await notifyUser(payload);
  } catch (error) {
    console.error("Mandali dispatch notification failed:", error.message);
  }
};

const localDate = (date, timezone = "Asia/Kolkata") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const inquiryPayload = (dispatch, candidate, inquiryId) => ({
  _id: inquiryId,
  dispatchId: dispatch._id,
  mandali: candidate.vendor,
  customer: dispatch.customer,
  name: dispatch.name,
  phone: dispatch.phone,
  eventType: dispatch.eventType,
  eventDate: dispatch.eventDate,
  eventTime: dispatch.eventTime,
  timezone: dispatch.timezone || "Asia/Kolkata",
  location: dispatch.location,
  latitude: dispatch.latitude,
  longitude: dispatch.longitude,
  distanceKm: candidate.distanceKm,
  guestCount: dispatch.guestCount,
  budget: dispatch.budget,
  message: dispatch.message,
  status: "pending",
});

const notifyCandidate = async (dispatch, candidate, inquiry) => {
  const expiry = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);
  await notifySafely({
    userId: candidate.vendorUser,
    title: "Bhajan Mandli booking request",
    message: `${dispatch.eventType} on ${localDate(dispatch.eventDate, dispatch.timezone)} at ${dispatch.eventTime}. You have 2 minutes to send a quote or decline. Distance: ${candidate.distanceKm} km.`,
    type: "mandali_booking_request",
    priority: "urgent",
    actionType: "open_notification",
    referenceId: inquiry._id,
    referenceType: "Inquiry",
    data: {
      inquiryId: String(inquiry._id),
      dispatchId: String(dispatch._id),
      expiresAt: expiry.toISOString(),
      distanceKm: candidate.distanceKm,
      eventType: dispatch.eventType,
      service: "bhajan_mandli",
    },
  });
};

async function notifyNoMandali(dispatch) {
  await notifySafely({
    userId: dispatch.customer,
    title: "No Bhajan Mandli available",
    message: "The nearby Mandalis did not accept the request within their response windows. Please try another date or location.",
    type: "mandali_booking_update",
    priority: "high",
    referenceId: dispatch.activeInquiry || undefined,
    referenceType: dispatch.activeInquiry ? "Inquiry" : "",
    data: {
      dispatchId: String(dispatch._id),
      status: "no_mandali",
    },
  });
}

/**
 * Notify exactly one candidate at a time. Atomic compare-and-set prevents a
 * second worker/request from claiming another candidate while an offer is active.
 */
async function dispatchNextMandali(dispatchId) {
  let dispatch = await MandaliDispatch.findById(dispatchId);
  if (!dispatch || dispatch.status !== "pending" || dispatch.activeInquiry) {
    return { dispatch, inquiry: null };
  }

  const nextIndex = dispatch.candidates.findIndex(
    (candidate, index) => index > dispatch.currentIndex && candidate.state === "queued"
  );

  if (nextIndex < 0) {
    const exhausted = await MandaliDispatch.findOneAndUpdate(
      {
        _id: dispatch._id,
        status: "pending",
        activeInquiry: null,
        currentIndex: dispatch.currentIndex,
      },
      { $set: { status: "no_mandali", activeVendor: null, activeExpiresAt: null } },
      { new: true }
    );

    if (exhausted) await notifyNoMandali(exhausted);
    return { dispatch: exhausted || dispatch, inquiry: null };
  }

  const candidate = dispatch.candidates[nextIndex];
  const inquiryId = new mongoose.Types.ObjectId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OFFER_TIMEOUT_SECONDS * 1000);
  const setFields = {
    currentIndex: nextIndex,
    activeVendor: candidate.vendor,
    activeInquiry: inquiryId,
    activeExpiresAt: expiresAt,
    [`candidates.${nextIndex}.state`]: "offered",
    [`candidates.${nextIndex}.inquiry`]: inquiryId,
    [`candidates.${nextIndex}.offeredAt`]: now,
    [`candidates.${nextIndex}.expiresAt`]: expiresAt,
  };

  const claimed = await MandaliDispatch.findOneAndUpdate(
    {
      _id: dispatch._id,
      status: "pending",
      activeInquiry: null,
      currentIndex: dispatch.currentIndex,
    },
    { $set: setFields },
    { new: true }
  );

  if (!claimed) {
    const latest = await MandaliDispatch.findById(dispatchId);
    const activeInquiry = latest?.activeInquiry
      ? await Inquiry.findById(latest.activeInquiry)
      : null;
    return { dispatch: latest, inquiry: activeInquiry };
  }

  const claimedCandidate = claimed.candidates[nextIndex];
  try {
    const inquiry = await Inquiry.create(inquiryPayload(claimed, claimedCandidate, inquiryId));
    await notifyCandidate(claimed, claimedCandidate, inquiry);
    await MandaliDispatch.updateOne(
      { _id: claimed._id, activeInquiry: inquiry._id },
      { $set: { [`candidates.${nextIndex}.notificationSentAt`]: new Date() } }
    );
    return { dispatch: claimed, inquiry };
  } catch (error) {
    console.error("Failed to create Mandali offer:", error.message);
    await MandaliDispatch.updateOne(
      { _id: claimed._id, status: "pending", activeInquiry: inquiryId },
      {
        $set: {
          activeInquiry: null,
          activeVendor: null,
          activeExpiresAt: null,
          [`candidates.${nextIndex}.state`]: "skipped",
        },
      }
    );
    return dispatchNextMandali(dispatchId);
  }
}

async function advanceAfterResponse(inquiry, resultState = "declined") {
  if (!inquiry?.dispatchId) return null;

  const dispatch = await MandaliDispatch.findById(inquiry.dispatchId);
  if (!dispatch || dispatch.status !== "pending" || String(dispatch.activeInquiry) !== String(inquiry._id)) {
    return dispatch;
  }

  const index = dispatch.currentIndex;
  if (index < 0 || !dispatch.candidates[index]) return dispatch;

  const advanced = await MandaliDispatch.findOneAndUpdate(
    {
      _id: dispatch._id,
      status: "pending",
      activeInquiry: inquiry._id,
      currentIndex: index,
    },
    {
      $set: {
        activeInquiry: null,
        activeVendor: null,
        activeExpiresAt: null,
        [`candidates.${index}.state`]: resultState,
        [`candidates.${index}.respondedAt`]: new Date(),
      },
    },
    { new: true }
  );

  if (!advanced) return MandaliDispatch.findById(dispatch._id);
  const next = await dispatchNextMandali(advanced._id);
  return next.dispatch;
}

async function markDispatchQuoted(inquiry) {
  if (!inquiry?.dispatchId) return null;
  const dispatch = await MandaliDispatch.findById(inquiry.dispatchId);
  if (!dispatch || String(dispatch.activeInquiry) !== String(inquiry._id)) return dispatch;

  const index = dispatch.currentIndex;
  const update = {
    status: "quoted",
    activeExpiresAt: null,
  };
  if (index >= 0 && dispatch.candidates[index]) {
    update[`candidates.${index}.state`] = "quoted";
    update[`candidates.${index}.respondedAt`] = new Date();
  }

  return MandaliDispatch.findOneAndUpdate(
    { _id: dispatch._id, status: "pending", activeInquiry: inquiry._id },
    { $set: update },
    { new: true }
  );
}

async function markDispatchAccepted(inquiry, bookingId) {
  if (!inquiry?.dispatchId) return null;
  const dispatch = await MandaliDispatch.findById(inquiry.dispatchId);
  if (!dispatch) return null;
  dispatch.status = "accepted";
  dispatch.booking = bookingId || null;
  dispatch.acceptedAt = new Date();
  dispatch.activeExpiresAt = null;
  dispatch.candidates.forEach((candidate, index) => {
    if (String(candidate.inquiry || "") === String(inquiry._id)) {
      candidate.state = "accepted";
      candidate.respondedAt = new Date();
    } else if (candidate.state === "queued" || candidate.state === "offered") {
      candidate.state = "skipped";
    }
  });
  await dispatch.save();
  await notifySafely({
    userId: dispatch.customer,
    title: "Bhajan Mandli booking accepted",
    message: "Your selected Mandli quote was accepted. Continue to advance payment to confirm the booking.",
    type: "mandali_booking_update",
    priority: "high",
    referenceId: inquiry._id,
    referenceType: "Inquiry",
    data: { dispatchId: String(dispatch._id), inquiryId: String(inquiry._id), status: "accepted" },
  });
  return dispatch;
}

async function cancelMandaliDispatch(dispatchId, customerId) {
  const filter = { _id: dispatchId, status: { $in: ["pending", "quoted"] } };
  if (customerId) filter.customer = customerId;
  const dispatch = await MandaliDispatch.findOne(filter);
  if (!dispatch) return null;

  dispatch.status = "cancelled";
  dispatch.activeExpiresAt = null;
  dispatch.candidates.forEach((candidate) => {
    if (candidate.state === "queued" || candidate.state === "offered") candidate.state = "skipped";
  });
  await dispatch.save();

  if (dispatch.activeInquiry) {
    await Inquiry.updateOne(
      { _id: dispatch.activeInquiry, status: "pending" },
      { $set: { status: "cancelled", responseMessage: "Cancelled by customer", respondedAt: new Date() } }
    );
  }
  return dispatch;
}

async function processExpiredOffer(dispatch) {
  if (!dispatch.activeInquiry || !dispatch.activeExpiresAt || dispatch.activeExpiresAt > new Date()) return;

  const expiredInquiry = await Inquiry.findOneAndUpdate(
    { _id: dispatch.activeInquiry, status: "pending", dispatchId: dispatch._id },
    {
      $set: {
        status: "rejected",
        responseMessage: "Offer expired: no response within 2 minutes",
        respondedAt: new Date(),
      },
    },
    { new: true }
  );

  if (expiredInquiry) {
    await advanceAfterResponse(expiredInquiry, "timed_out");
    return;
  }

  // A quote may have been saved just before this sweeper ran.
  const latestInquiry = await Inquiry.findById(dispatch.activeInquiry);
  if (latestInquiry?.status === "responded") {
    await markDispatchQuoted(latestInquiry);
  } else if (latestInquiry?.status === "rejected") {
    await advanceAfterResponse(latestInquiry, "declined");
  } else if (!latestInquiry) {
    // Recover if the process stopped after claiming an offer but before writing
    // the Inquiry record. This prevents a permanent queue lock.
    const index = dispatch.currentIndex;
    const recovered = await MandaliDispatch.findOneAndUpdate(
      { _id: dispatch._id, status: "pending", activeInquiry: dispatch.activeInquiry },
      { $set: {
        activeInquiry: null,
        activeVendor: null,
        activeExpiresAt: null,
        ...(index >= 0 ? { [`candidates.${index}.state`]: "timed_out" } : {}),
      } },
      { new: true }
    );
    if (recovered) await dispatchNextMandali(recovered._id);
  }
}

async function sweepMandaliDispatches() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const now = new Date();
    const expired = await MandaliDispatch.find({
      status: "pending",
      activeInquiry: { $ne: null },
      activeExpiresAt: { $lte: now },
    }).limit(100);

    for (const dispatch of expired) {
      await processExpiredOffer(dispatch);
    }

    // Recovery path for a process restart after an Inquiry was created but
    // before its notification attempt was recorded.
    const unnotified = await MandaliDispatch.find({
      status: "pending",
      activeInquiry: { $ne: null },
      activeExpiresAt: { $gt: now },
      candidates: { $elemMatch: { state: "offered", notificationSentAt: null } },
    }).limit(100);
    for (const dispatch of unnotified) {
      const index = dispatch.currentIndex;
      const candidate = dispatch.candidates[index];
      if (!candidate || candidate.notificationSentAt || !dispatch.activeInquiry) continue;
      const inquiry = await Inquiry.findOne({ _id: dispatch.activeInquiry, status: "pending" });
      if (!inquiry) continue;
      await notifyCandidate(dispatch, candidate, inquiry);
      await MandaliDispatch.updateOne(
        { _id: dispatch._id, activeInquiry: inquiry._id },
        { $set: { [`candidates.${index}.notificationSentAt`]: new Date() } }
      );
    }

    // Recovery path for a process restart between offers.
    const waiting = await MandaliDispatch.find({
      status: "pending",
      activeInquiry: null,
    }).sort({ createdAt: 1 }).limit(100).select("_id");

    for (const item of waiting) {
      await dispatchNextMandali(item._id);
    }
  } catch (error) {
    console.error("Mandali dispatch sweeper error:", error.message);
  } finally {
    sweepRunning = false;
  }
}

function startMandaliDispatchSweeper() {
  if (sweepTimer) return;
  sweepMandaliDispatches().catch(() => {});
  sweepTimer = setInterval(() => {
    sweepMandaliDispatches().catch(() => {});
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  console.log("Bhajan Mandli sequential dispatch sweeper started (2-minute offer timeout)");
}

function stopMandaliDispatchSweeper() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = {
  dispatchNextMandali,
  advanceAfterResponse,
  markDispatchQuoted,
  markDispatchAccepted,
  cancelMandaliDispatch,
  startMandaliDispatchSweeper,
  stopMandaliDispatchSweeper,
  sweepMandaliDispatches,
};
