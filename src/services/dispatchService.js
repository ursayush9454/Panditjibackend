/**
 * Dispatch engine for instant (Uber/Rapido-style) pandit requests.
 *
 *  - nearest online pandit is offered the job for OFFER_TIMEOUT_SEC seconds
 *  - decline / timeout -> next nearest pandit
 *  - everything is stored in MongoDB and advanced with atomic updates, so it is
 *    restart-safe and works with several server instances (no in-memory timers).
 *    A sweeper (startDispatchSweeper) advances expired offers.
 */
const Vendor = require("../models/Vendor");
const InstantRequest = require("../models/InstantRequest");
const PanditPujaService = require("../models/PanditPujaService");
const { emitToUser } = require("./realtime");
const { notifyUser } = require("./notificationService");

const OFFER_TIMEOUT_SEC = () => Number(process.env.OFFER_TIMEOUT_SEC || 30);
const SEARCH_TIMEOUT_SEC = () => Number(process.env.SEARCH_TIMEOUT_SEC || 180);
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
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Online, approved, free pandits near a point, nearest first.
 */
const findNearbyPandits = async ({ lat, lng, radiusKm = 10, excludeIds = [], pujaId = null, limit = 10 }) => {
  const freshSince = new Date(Date.now() - LOCATION_FRESH_MIN() * 60000);

  const query = {
    role: "pandit",
    status: "approved",
    isOnline: true,
    activeInstantRequest: null,
    locationUpdatedAt: { $gte: freshSince },
    _id: { $nin: excludeIds },
    location: {
      $nearSphere: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  };

  // If some pandits explicitly list this puja, restrict to them. Otherwise any pandit.
  if (pujaId) {
    const ids = await PanditPujaService.find({
      puja: pujaId,
      isActive: true,
      adminApproved: true,
    }).distinct("pandit");
    if (ids.length) {
      query._id = { $nin: excludeIds, $in: ids };
    }
  }

  const vendors = await Vendor.find(query)
    .select("name user profileImage experience location serviceRadiusKm commissionPercentage")
    .limit(limit * 2);

  return vendors
    .map((v) => {
      const [vLng, vLat] = v.location.coordinates;
      const distanceKm = haversineKm(lat, lng, vLat, vLng);
      return { vendor: v, distanceKm };
    })
    .filter((x) => x.distanceKm <= (x.vendor.serviceRadiusKm || radiusKm))
    .slice(0, limit);
};

const finishNoPandit = async (request) => {
  const updated = await InstantRequest.findOneAndUpdate(
    { _id: request._id, status: "searching" },
    { $set: { status: "no_pandit", currentOfferVendor: null, offerExpiresAt: null } },
    { new: true }
  );
  if (!updated) return null;
  emitToUser(updated.customer, "instant:update", { requestId: updated._id, status: "no_pandit" });
  try {
    await notifyUser({
      userId: updated.customer,
      title: "No pandit available",
      message: "We could not find a pandit nearby right now. Please try again or schedule a booking.",
      type: "booking_rejected",
      referenceId: updated._id,
      referenceType: "instant_request",
    });
  } catch (_) {}
  return updated;
};

/**
 * Offer the request to the next nearest pandit (or end the search).
 */
const offerNext = async (requestId) => {
  const request = await InstantRequest.findOne({
    _id: requestId,
    status: "searching",
    currentOfferVendor: null,
  });
  if (!request) return null;

  if (request.searchExpiresAt && request.searchExpiresAt <= new Date()) {
    return finishNoPandit(request);
  }

  const [lng, lat] = request.pickup.coordinates;
  const tried = request.candidates.map((c) => c.vendor);
  const [next] = await findNearbyPandits({
    lat,
    lng,
    radiusKm: request.radiusKm,
    excludeIds: tried,
    pujaId: request.puja,
    limit: 1,
  });

  if (!next) return finishNoPandit(request);

  const now = new Date();
  const claimed = await InstantRequest.findOneAndUpdate(
    { _id: request._id, status: "searching", currentOfferVendor: null },
    {
      $set: {
        currentOfferVendor: next.vendor._id,
        offerExpiresAt: new Date(now.getTime() + OFFER_TIMEOUT_SEC() * 1000),
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
  if (!claimed) return null; // another worker advanced it

  const payload = {
    requestId: claimed._id,
    pujaName: claimed.pujaName,
    address: claimed.address,
    pickup: { latitude: lat, longitude: lng },
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
      message: `${claimed.pujaName} • ${payload.distanceKm} km away • ₹${payload.earning ?? ""}`,
      type: "job_created",
      priority: "high",
      referenceId: claimed._id,
      referenceType: "instant_request",
      data: { requestId: String(claimed._id) },
    });
  } catch (_) {}

  return claimed;
};

/**
 * Close the currently pending offer (decline/timeout) and move on.
 */
const closeCurrentOffer = async ({ requestId, response, vendorId = null }) => {
  const q = { status: "searching", currentOfferVendor: { $ne: null } };
  if (requestId) q._id = requestId;
  if (vendorId) q.currentOfferVendor = vendorId;
  else q.offerExpiresAt = { $lte: new Date() };

  return InstantRequest.findOneAndUpdate(
    q,
    {
      $set: {
        currentOfferVendor: null,
        offerExpiresAt: null,
        "candidates.$[c].response": response,
        "candidates.$[c].respondedAt": new Date(),
      },
    },
    { new: true, arrayFilters: [{ "c.response": "pending" }] }
  );
};

/**
 * Called every few seconds. Advances expired offers and stuck requests.
 */
const sweep = async () => {
  const now = new Date();

  // 1) expired offers
  const expired = await InstantRequest.find({
    status: "searching",
    currentOfferVendor: { $ne: null },
    offerExpiresAt: { $lte: now },
  }).select("_id");
  for (const r of expired) {
    const closed = await closeCurrentOffer({ requestId: r._id, response: "timeout" });
    if (closed) await offerNext(closed._id);
  }

  // 2) searching but no active offer (e.g. crashed between steps)
  const stuck = await InstantRequest.find({
    status: "searching",
    currentOfferVendor: null,
    updatedAt: { $lte: new Date(now.getTime() - 15000) },
  }).select("_id");
  for (const r of stuck) await offerNext(r._id);
};

let timer = null;
const startDispatchSweeper = () => {
  if (timer) return;
  timer = setInterval(() => {
    sweep().catch((e) => console.error("Dispatch sweep error:", e.message));
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
};
