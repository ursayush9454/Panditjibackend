/**
 * Instant Puja dispatch service.
 *
 * - One Pandit receives an offer at a time.
 * - Each offer expires after the configured timeout (default 120 seconds).
 * - Expired/declined offers move to the next eligible Pandit.
 * - A background sweeper handles timeouts and arrival reminders.
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
  Number(
    cachedSettings?.offerTimeoutSeconds ||
      process.env.OFFER_TIMEOUT_SEC ||
      120
  );

const SEARCH_TIMEOUT_SEC = () =>
  Number(
    cachedSettings?.searchTimeoutSeconds ||
      process.env.SEARCH_TIMEOUT_SEC ||
      180
  );

const LOCATION_FRESH_MIN = () =>
  Number(process.env.LOCATION_FRESH_MINUTES || 5);

const AVG_SPEED_KMPH = () =>
  Number(process.env.AVG_SPEED_KMPH || 25);

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const etaMinutes = (km) =>
  Math.max(1, Math.round((km / AVG_SPEED_KMPH()) * 60));

const validCoords = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

/**
 * Finds approved, online, eligible Pandits with a recent location.
 * Priority order:
 * 1. Higher admin priority
 * 2. Premium first, if enabled
 * 3. Shorter distance
 */
const findNearbyPandits = async ({
  lat,
  lng,
  radiusKm = 10,
  excludeIds = [],
  pujaId = null,
  limit = 10,
}) => {
  const settings = await getDispatchSettings();
  const freshSince = new Date(
    Date.now() - LOCATION_FRESH_MIN() * 60 * 1000
  );

  const query = {
    role: "pandit",
    status: "approved",
    isOnline: true,
    activeInstantRequest: null,
    instantEligible: { $ne: false },
    locationUpdatedAt: { $gte: freshSince },
    _id: { $nin: excludeIds },
    location: {
      $nearSphere: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        $maxDistance: radiusKm * 1000,
      },
    },
  };

  // If this puja has explicitly approved Pandit services,
  // only those Pandits are eligible.
  if (pujaId) {
    const panditIds = await PanditPujaService.find({
      puja: pujaId,
      isActive: true,
      adminApproved: true,
    }).distinct("pandit");

    if (panditIds.length) {
      query._id = {
        $nin: excludeIds,
        $in: panditIds,
      };
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
        distanceKm: haversineKm(
          lat,
          lng,
          vendorLat,
          vendorLng
        ),
      };
    })
    .filter(
      ({ vendor, distanceKm }) =>
        distanceKm <= (vendor.serviceRadiusKm || radiusKm)
    )
    .sort((a, b) => {
      const priorityDifference =
        Number(b.vendor.instantPriority || 0) -
        Number(a.vendor.instantPriority || 0);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      if (settings.premiumFirst !== false) {
        const premiumDifference =
          Number(Boolean(b.vendor.isPremium)) -
          Number(Boolean(a.vendor.isPremium));

        if (premiumDifference !== 0) {
          return premiumDifference;
        }
      }

      return a.distanceKm - b.distanceKm;
    })
    .slice(0, limit);
};

const finishNoPandit = async (request) => {
  const updated = await InstantRequest.findOneAndUpdate(
    {
      _id: request._id,
      status: "searching",
    },
    {
      $set: {
        status: "no_pandit",
        currentOfferVendor: null,
        offerExpiresAt: null,
      },
    },
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
 * Offers the request to the next eligible Pandit.
 */
const offerNext = async (requestId) => {
  const request = await InstantRequest.findOne({
    _id: requestId,
    status: "searching",
    currentOfferVendor: null,
  });

  if (!request) return null;

  if (
    request.searchExpiresAt &&
    request.searchExpiresAt <= new Date()
  ) {
    return finishNoPandit(request);
  }

  const [lng, lat] = request.pickup.coordinates;
  const alreadyTried = request.candidates.map(
    (candidate) => candidate.vendor
  );

  const [next] = await findNearbyPandits({
    lat,
    lng,
    radiusKm: request.radiusKm,
    excludeIds: alreadyTried,
    pujaId: request.puja,
    limit: 1,
  });

  if (!next) return finishNoPandit(request);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + OFFER_TIMEOUT_SEC() * 1000
  );

  const claimed = await InstantRequest.findOneAndUpdate(
    {
      _id: request._id,
      status: "searching",
      currentOfferVendor: null,
    },
    {
      $set: {
        currentOfferVendor: next.vendor._id,
        offerExpiresAt: expiresAt,
      },
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

  const [requestLng, requestLat] =
    claimed.pickup.coordinates;

  const payload = {
    requestId: claimed._id,
    pujaName: claimed.pujaName,
    address: claimed.address,
    pickup: {
      latitude: requestLat,
      longitude: requestLng,
    },
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
        `${claimed.pujaName} • ` +
        `${payload.distanceKm} km away • ` +
        `₹${payload.earning ?? ""}`,
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
const closeCurrentOffer = async ({
  requestId,
  response,
  vendorId = null,
}) => {
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
    {
      new: true,
      arrayFilters: [
        { "candidate.response": "pending" },
      ],
    }
  );
};

/**
 * Sends one reminder to the assigned Pandit when a scheduled puja
 * is due within the next hour.
 *
 * The atomic update prevents duplicate reminders when multiple
 * server instances are running.
 */
const sendArrivalReminders = async () => {
  const now = new Date();
  const oneHourFromNow = new Date(
    now.getTime() + 60 * 60 * 1000
  );

  const dueRequests = await InstantRequest.find({
    status: "accepted",
    assignedVendor: { $ne: null },
    scheduledAt: {
      $gt: now,
      $lte: oneHourFromNow,
    },
    arrivalReminderSentAt: null,
  })
    .select(
      "_id assignedVendor scheduledAt pujaName address"
    )
    .limit(100);

  for (const request of dueRequests) {
    const claimed = await InstantRequest.findOneAndUpdate(
      {
        _id: request._id,
        status: "accepted",
        arrivalReminderSentAt: null,
      },
      {
        $set: {
          arrivalReminderSentAt: new Date(),
        },
      },
      { new: true }
    );

    if (!claimed) continue;

    const vendor = await Vendor.findById(
      claimed.assignedVendor
    ).select("user");

    if (!vendor?.user) continue;

    const scheduledText = new Date(
      claimed.scheduledAt
    ).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    try {
      await notifyUser({
        userId: vendor.user,
        title: "Puja location arrival reminder",
        message:
          `Your puja (${claimed.pujaName}) is scheduled for ` +
          `${scheduledText}. Please reach the customer's location on time. ` +
          `Address: ${claimed.address}`,
        type: "instant_puja_reminder",
        priority: "high",
        referenceId: claimed._id,
        referenceType: "InstantRequest",
        data: {
          requestId: String(claimed._id),
          scheduledAt: claimed.scheduledAt,
        },
      });

      emitToUser(vendor.user, "instant:arrival-reminder", {
        requestId: claimed._id,
        scheduledAt: claimed.scheduledAt,
        address: claimed.address,
        pujaName: claimed.pujaName,
      });
    } catch (error) {
      console.error(
        "Arrival reminder failed:",
        error.message
      );
    }
  }
};

/**
 * Runs regularly to:
 * 1. Send one-hour arrival reminders.
 * 2. Move expired offers to the next Pandit.
 * 3. Recover requests that got stuck during a server restart.
 */
const sweep = async () => {
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

    if (closed) {
      await offerNext(closed._id);
    }
  }

  const stuckRequests = await InstantRequest.find({
    status: "searching",
    currentOfferVendor: null,
    updatedAt: {
      $lte: new Date(now.getTime() - 15000),
    },
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
  getDispatchSettings,
  sendArrivalReminders,
};