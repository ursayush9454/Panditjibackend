/**
 * Dispatch engine for scheduled Pandit puja requests.
 *
 *  - Customer request stays "searching" (shown as "pending") until a Pandit accepts.
 *  - Only approved + online Pandits inside the admin radius (default 5 km) get offers.
 *  - ONE Pandit at a time, each gets the offer for the admin timeout (default 2 minutes).
 *    Decline / timeout -> next Pandit.
 *  - Admin controls who is notified first: per-Pandit eligibility + priority, premium-first,
 *    radius, offer timeout and search timeout (InstantDispatchSettings).
 *  - Pandits who already have another job around the same time are skipped.
 *  - Accepted Pandits get reminders starting `reminderStartHours` (default 2h) before the
 *    puja and repeating every `reminderIntervalMinutes` until they mark arrival.
 *  - Everything lives in MongoDB with atomic updates, so it is restart-safe and works with
 *    several server instances. A sweeper advances expired offers and sends reminders.
 */
const Vendor = require("../models/Vendor");
const InstantRequest = require("../models/InstantRequest");
const PanditPujaService = require("../models/PanditPujaService");
const InstantDispatchSettings = require("../models/InstantDispatchSettings");
const { emitToUser } = require("./realtime");
const { notifyUser } = require("./notificationService");

let cachedSettings = null;
let settingsCachedAt = 0;

const getDispatchSettings = async () => {
  if (cachedSettings && Date.now() - settingsCachedAt < 5000) {
    return cachedSettings;
  }

  try {
    cachedSettings = await InstantDispatchSettings.findOne({
      key: "global",
    }).lean();
    settingsCachedAt = Date.now();
  } catch (error) {
    console.error("Could not load dispatch settings:", error.message);
  }

  return cachedSettings || {};
};

const OFFER_TIMEOUT_SEC = () =>
  Number(cachedSettings?.offerTimeoutSeconds || process.env.OFFER_TIMEOUT_SEC || 120);

const SEARCH_TIMEOUT_SEC = () =>
  Number(cachedSettings?.searchTimeoutSeconds || process.env.SEARCH_TIMEOUT_SEC || 3600);

const DEFAULT_RADIUS_KM = () =>
  Number(cachedSettings?.defaultRadiusKm || process.env.INSTANT_RADIUS_KM || 5);

const MIN_ADVANCE_HOURS = () =>
  Number(
    cachedSettings?.minAdvanceHours ??
      process.env.MIN_ADVANCE_HOURS ??
      48
  );

const REMINDER_START_HOURS = () =>
  Number(cachedSettings?.reminderStartHours || process.env.REMINDER_START_HOURS || 2);

const REMINDER_INTERVAL_MIN = () =>
  Number(cachedSettings?.reminderIntervalMinutes || process.env.REMINDER_INTERVAL_MINUTES || 30);

// A Pandit with another accepted job within this many minutes of the puja is skipped.
const JOB_BUFFER_MIN = () => Number(process.env.JOB_BUFFER_MINUTES || 180);

const LOCATION_FRESH_MIN = () => Number(process.env.LOCATION_FRESH_MINUTES || 5);
const AVG_SPEED_KMPH = () => Number(process.env.AVG_SPEED_KMPH || 25);

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const etaMinutes = (km) => Math.max(1, Math.round((km / AVG_SPEED_KMPH()) * 60));

const validCoords = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

/**
 * Vendors that already hold another accepted job near this time.
 */
const busyVendorIds = async (scheduledAt, ignoreRequestId = null) => {
  if (!scheduledAt) return [];

  const t = new Date(scheduledAt).getTime();
  const buf = JOB_BUFFER_MIN() * 60000;

  const q = {
    status: { $in: ["accepted", "arrived", "in_progress"] },
    assignedVendor: { $ne: null },
    scheduledAt: { $gte: new Date(t - buf), $lte: new Date(t + buf) },
  };
  if (ignoreRequestId) q._id = { $ne: ignoreRequestId };

  return InstantRequest.find(q).distinct("assignedVendor");
};

/**
 * Online, approved, free Pandits near a point.
 * Order: admin priority -> premium first (if enabled) -> nearest.
 */
const findNearbyPandits = async ({
  lat,
  lng,
  radiusKm,
  excludeIds = [],
  pujaId = null,
  scheduledAt = null,
  ignoreRequestId = null,
  limit = 10,
}) => {
  const settings = await getDispatchSettings();
  const radius = Number(radiusKm) || DEFAULT_RADIUS_KM();
  const freshSince = new Date(Date.now() - LOCATION_FRESH_MIN() * 60 * 1000);

  const busy = await busyVendorIds(scheduledAt, ignoreRequestId);
  const skip = [...excludeIds, ...busy];

  const query = {
    role: "pandit",
    status: "approved",
    isOnline: true,
    activeInstantRequest: null,
    instantEligible: { $ne: false },
    locationUpdatedAt: { $gte: freshSince },
    _id: { $nin: skip },
    location: {
      $nearSphere: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius * 1000,
      },
    },
  };

  // If this puja has explicitly approved Pandit services, only those Pandits are eligible.
  if (pujaId) {
    const panditIds = await PanditPujaService.find({
      puja: pujaId,
      isActive: true,
      adminApproved: true,
    }).distinct("pandit");

    if (panditIds.length) {
      query._id = { $nin: skip, $in: panditIds };
    }
  }

  const vendors = await Vendor.find(query)
    .select(
      "name user profileImage experience location serviceRadiusKm commissionPercentage isPremium instantPriority instantEligible"
    )
    .limit(Math.max(limit * 20, 200));

  return vendors
    .map((vendor) => {
      const [vendorLng, vendorLat] = vendor.location.coordinates;
      return {
        vendor,
        distanceKm: haversineKm(lat, lng, vendorLat, vendorLng),
      };
    })
    // never beyond the admin radius, nor the Pandit's own service radius
    .filter(
      ({ vendor, distanceKm }) =>
        distanceKm <= radius &&
        distanceKm <= (vendor.serviceRadiusKm || radius)
    )
    .sort((a, b) => {
      const priorityDifference =
        Number(b.vendor.instantPriority || 0) - Number(a.vendor.instantPriority || 0);
      if (priorityDifference !== 0) return priorityDifference;

      if (settings.premiumFirst !== false) {
        const premiumDifference =
          Number(Boolean(b.vendor.isPremium)) - Number(Boolean(a.vendor.isPremium));
        if (premiumDifference !== 0) return premiumDifference;
      }

      return a.distanceKm - b.distanceKm;
    })
    .slice(0, limit);
};

const finishNoPandit = async (request) => {
  const updated = await InstantRequest.findOneAndUpdate(
    { _id: request._id, status: "searching" },
    { $set: { status: "no_pandit", currentOfferVendor: null, offerExpiresAt: null } },
    { new: true }
  );

  if (!updated) return null;

  emitToUser(updated.customer, "instant:update", {
    requestId: updated._id,
    status: "no_pandit",
    message: "No Pandit is available for this request.",
  });

  try {
    await notifyUser({
      userId: updated.customer,
      title: "No Pandit available",
      message:
        "We could not find an eligible Pandit nearby. Please try again or schedule another time.",
      type: "booking_rejected",
      referenceId: updated._id,
      referenceType: "InstantRequest",
      data: { requestId: String(updated._id) },
    });
  } catch (error) {
    console.error("No-Pandit notification failed:", error.message);
  }

  return updated;
};

/**
 * Offers the request to the next eligible Pandit (one at a time).
 * If nobody is available right now the request stays pending and the sweeper retries
 * until the search window (admin controlled) closes.
 */
const offerNext = async (requestId) => {
  await getDispatchSettings();

  const request = await InstantRequest.findOne({
    _id: requestId,
    status: "searching",
    currentOfferVendor: null,
  });

  if (!request) return null;

  const now = new Date();

  if (
    (request.searchExpiresAt && request.searchExpiresAt <= now) ||
    request.scheduledAt <= now
  ) {
    return finishNoPandit(request);
  }

  const [lng, lat] = request.pickup.coordinates;
  const alreadyTried = request.candidates.map((c) => c.vendor);

  const [next] = await findNearbyPandits({
    lat,
    lng,
    radiusKm: request.radiusKm,
    excludeIds: alreadyTried,
    pujaId: request.puja,
    scheduledAt: request.scheduledAt,
    ignoreRequestId: request._id,
    limit: 1,
  });

  // Nobody online right now: stay pending, retry on the next sweep.
  if (!next) return null;

  const expiresAt = new Date(now.getTime() + OFFER_TIMEOUT_SEC() * 1000);

  const claimed = await InstantRequest.findOneAndUpdate(
    { _id: request._id, status: "searching", currentOfferVendor: null },
    {
      $set: { currentOfferVendor: next.vendor._id, offerExpiresAt: expiresAt },
      $push: {
        candidates: {
          vendor: next.vendor._id,
          distanceKm: Math.round(next.distanceKm * 100) / 100,
          offeredAt: now,
          response: "pending",
        },
      },
    },
    { new: true }
  );

  // Another worker may have already assigned the next offer.
  if (!claimed) return null;

  const [requestLng, requestLat] = claimed.pickup.coordinates;

  const payload = {
    requestId: claimed._id,
    pujaName: claimed.pujaName,
    address: claimed.address,
    pickup: { latitude: requestLat, longitude: requestLng },
    scheduledAt: claimed.scheduledAt,
    distanceKm: Math.round(next.distanceKm * 10) / 10,
    etaMinutes: etaMinutes(next.distanceKm),
    earning: claimed.fare?.vendorAmount,
    paymentMethod: claimed.paymentMethod,
    expiresAt: claimed.offerExpiresAt,
    timeoutSec: OFFER_TIMEOUT_SEC(),
  };

  emitToUser(next.vendor.user, "instant:offer", payload);

  try {
    await notifyUser({
      userId: next.vendor.user,
      title: "New puja request nearby",
      message:
        `${claimed.pujaName} • ${payload.distanceKm} km away • ` +
        `₹${payload.earning ?? ""} • ` +
        new Date(claimed.scheduledAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "short",
        }),
      type: "job_created",
      priority: "high",
      referenceId: claimed._id,
      referenceType: "InstantRequest",
      data: {
        requestId: String(claimed._id),
        expiresAt: claimed.offerExpiresAt,
      },
    });
  } catch (error) {
    console.error("Pandit offer notification failed:", error.message);
  }

  return claimed;
};

/**
 * Closes an offer after decline or timeout.
 */
const closeCurrentOffer = async ({ requestId, response, vendorId = null }) => {
  const query = {
    status: "searching",
    currentOfferVendor: { $ne: null },
  };

  if (requestId) query._id = requestId;

  if (vendorId) {
    query.currentOfferVendor = vendorId;
  } else {
    query.offerExpiresAt = { $lte: new Date() };
  }

  return InstantRequest.findOneAndUpdate(
    query,
    {
      $set: {
        currentOfferVendor: null,
        offerExpiresAt: null,
        "candidates.$[candidate].response": response,
        "candidates.$[candidate].respondedAt": new Date(),
      },
    },
    { new: true, arrayFilters: [{ "candidate.response": "pending" }] }
  );
};

/**
 * Reminders to the assigned Pandit.
 * Starts `reminderStartHours` (default 2h) before the puja and repeats every
 * `reminderIntervalMinutes` (default 30) until the Pandit marks arrival.
 * The atomic claim prevents duplicates across server instances.
 */
const sendArrivalReminders = async () => {
  await getDispatchSettings();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_START_HOURS() * 3600000);
  const lateLimit = new Date(now.getTime() - 60 * 60000); // stop 1h after start time
  const dueBefore = new Date(now.getTime() - REMINDER_INTERVAL_MIN() * 60000);

  const filter = {
    status: "accepted",
    assignedVendor: { $ne: null },
    scheduledAt: { $gt: lateLimit, $lte: windowEnd },
    $or: [{ lastReminderAt: null }, { lastReminderAt: { $lte: dueBefore } }],
  };

  const due = await InstantRequest.find(filter).select("_id").limit(100);

  for (const item of due) {
    const claimed = await InstantRequest.findOneAndUpdate(
      { ...filter, _id: item._id },
      { $set: { lastReminderAt: new Date() }, $inc: { reminderCount: 1 } },
      { new: true }
    );

    if (!claimed) continue;

    if (!claimed.arrivalReminderSentAt) {
      await InstantRequest.updateOne(
        { _id: claimed._id, arrivalReminderSentAt: null },
        { $set: { arrivalReminderSentAt: new Date() } }
      );
    }

    const vendor = await Vendor.findById(claimed.assignedVendor).select("user");
    if (!vendor?.user) continue;

    const minutesLeft = Math.round((claimed.scheduledAt - now) / 60000);
    const when =
      minutesLeft > 0
        ? `starts in ${minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m` : `${minutesLeft} min`}`
        : `was due ${Math.abs(minutesLeft)} min ago`;

    const scheduledText = new Date(claimed.scheduledAt).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    try {
      await notifyUser({
        userId: vendor.user,
        title: "Puja reminder",
        message:
          `Your puja (${claimed.pujaName}) ${when} (${scheduledText}). ` +
          `Please reach the customer's location on time. Address: ${claimed.address}`,
        type: "instant_puja_reminder",
        priority: "high",
        referenceId: claimed._id,
        referenceType: "InstantRequest",
        data: {
          requestId: String(claimed._id),
          scheduledAt: claimed.scheduledAt,
          reminderNumber: claimed.reminderCount,
        },
      });

      emitToUser(vendor.user, "instant:arrival-reminder", {
        requestId: claimed._id,
        scheduledAt: claimed.scheduledAt,
        address: claimed.address,
        pujaName: claimed.pujaName,
        minutesLeft,
      });
    } catch (error) {
      console.error("Arrival reminder failed:", error.message);
    }
  }
};

/**
 * Runs regularly to send reminders, advance expired offers and recover stuck requests.
 */
const sweep = async () => {
  await getDispatchSettings();

  const now = new Date();

  await sendArrivalReminders();

  const expiredOffers = await InstantRequest.find({
    status: "searching",
    currentOfferVendor: { $ne: null },
    offerExpiresAt: { $lte: now },
  }).select("_id");

  for (const request of expiredOffers) {
    const closed = await closeCurrentOffer({
      requestId: request._id,
      response: "timeout",
    });

    if (closed) await offerNext(closed._id);
  }

  // Pending with no active offer (nobody online earlier, or crashed between steps)
  const stuckRequests = await InstantRequest.find({
    status: "searching",
    currentOfferVendor: null,
    updatedAt: { $lte: new Date(now.getTime() - 15000) },
  }).select("_id");

  for (const request of stuckRequests) {
    await offerNext(request._id);
  }
};

let timer = null;

const startDispatchSweeper = () => {
  if (timer) return;

  timer = setInterval(() => {
    sweep().catch((error) => {
      console.error("Dispatch sweep error:", error.message);
    });
  }, 5000);

  timer.unref?.();
};

const stopDispatchSweeper = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  haversineKm,
  etaMinutes,
  validCoords,
  findNearbyPandits,
  offerNext,
  closeCurrentOffer,
  sweep,
  startDispatchSweeper,
  stopDispatchSweeper,
  SEARCH_TIMEOUT_SEC,
  DEFAULT_RADIUS_KM,
  MIN_ADVANCE_HOURS,
  getDispatchSettings,
  sendArrivalReminders,
};
