const mongoose = require("mongoose");
const crypto = require("crypto");

const InstantRequest = require("../models/InstantRequest");
const Booking = require("../models/Booking");
const Vendor = require("../models/Vendor");
const Wallet = require("../models/Wallet");

const { computePujaFare } = require("../services/pricingService");
const {
  haversineKm,
  etaMinutes,
  validCoords,
  findNearbyPandits,
  offerNext,
  closeCurrentOffer,
  SEARCH_TIMEOUT_SEC,
  getDispatchSettings,
} = require("../services/dispatchService");
const { emitToUser } = require("../services/realtime");
const { notifyUser } = require("../services/notificationService");
const { settleBookingEarning } = require("../services/earningService");
const { debitWallet } = require("../services/walletService");

const ACTIVE = ["searching", "accepted", "arrived", "in_progress"];

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error(`${name} error:`, e);
    return fail(res, 500, `Failed: ${name}`);
  }
};

const getPandit = (userId) =>
  Vendor.findOne({ user: userId, role: "pandit", status: "approved" });

const generateOtp = () => String(crypto.randomInt(100000, 1000000));
const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const publicRequest = (
  r,
  { showOtp = false, otp = null, customerView = false } = {}
) => {
  const o = r.toObject ? r.toObject() : { ...r };

  delete o.candidates;
  delete o.currentOfferVendor;
  delete o.endOtpHash;
  delete o.endOtpExpiresAt;
  delete o.endOtpAttempts;

  // Internal status stays "searching".
  // Customer-facing status is "processing" until a Pandit accepts.
  if (customerView && o.status === "searching") {
    o.status = "processing";
  }

  if (showOtp && otp) o.startOtp = otp;

  return o;
};

const broadcast = (request, extra = {}) => {
  const payload = {
    requestId: request._id,
    status: request.status,
    ...extra,
  };

  emitToUser(request.customer, "instant:update", payload);

  if (request.assignedVendor) {
    Vendor.findById(request.assignedVendor)
      .select("user")
      .then((v) => v && emitToUser(v.user, "instant:update", payload))
      .catch(() => {});
  }
};

// ======================================================
// CUSTOMER
// ======================================================

exports.nearbyPandits = handle("nearbyPandits", async (req, res) => {
  const lat = Number(req.query.latitude);
  const lng = Number(req.query.longitude);

  if (!validCoords(lat, lng)) {
    return fail(res, 400, "Valid latitude and longitude are required");
  }

  const found = await findNearbyPandits({
    lat,
    lng,
    radiusKm: Number(req.query.radiusKm) || 10,
    pujaId: req.query.pujaId || null,
    limit: 20,
  });

  res.json({
    success: true,
    count: found.length,
    pandits: found.map(({ vendor, distanceKm }) => ({
      id: vendor._id,
      name: vendor.name,
      profileImage: vendor.profileImage,
      experience: vendor.experience,
      distanceKm: Math.round(distanceKm * 10) / 10,
      etaMinutes: etaMinutes(distanceKm),
      location: {
        latitude: Math.round(vendor.location.coordinates[1] * 1000) / 1000,
        longitude: Math.round(vendor.location.coordinates[0] * 1000) / 1000,
      },
    })),
  });
});

exports.estimate = handle("estimate", async (req, res) => {
  const { pujaId, withSamagri = false } = req.body;
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);

  if (!pujaId || !mongoose.isValidObjectId(pujaId)) {
    return fail(res, 400, "Valid pujaId is required");
  }

  if (!validCoords(lat, lng)) {
    return fail(res, 400, "Valid latitude and longitude are required");
  }

  const nearby = await findNearbyPandits({
    lat,
    lng,
    pujaId,
    limit: 1,
  });

  const nearest = nearby[0];

  const { breakdown, puja } = await computePujaFare({
    pujaId,
    withSamagri: Boolean(withSamagri),
    distanceKm: nearest ? nearest.distanceKm : 0,
    vendorCommissionPercent: nearest?.vendor.commissionPercentage,
  });

  const {
    vendorAmount,
    commissionAmount,
    commissionPercentage,
    ...customerFare
  } = breakdown;

  res.json({
    success: true,
    available: Boolean(nearest),
    etaMinutes: nearest ? etaMinutes(nearest.distanceKm) : null,
    puja: {
      id: puja._id,
      name: puja.name,
      durationMinutes: puja.durationMinutes,
    },
    fare: customerFare,
  });
});

exports.createRequest = handle("createRequest", async (req, res) => {
  const {
    pujaId,
    withSamagri = false,
    address,
    city = "",
    pincode = "",
    notes = "",
    paymentMethod = "cash",
    scheduledAt,
  } = req.body;

  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  const scheduledDate = new Date(scheduledAt);

  if (!pujaId || !mongoose.isValidObjectId(pujaId)) {
    return fail(res, 400, "Valid pujaId is required");
  }

  if (!address || !String(address).trim()) {
    return fail(res, 400, "Address is required");
  }

  if (!validCoords(lat, lng)) {
    return fail(res, 400, "Valid latitude and longitude are required");
  }

  if (!scheduledAt || Number.isNaN(scheduledDate.getTime())) {
    return fail(
      res,
      400,
      "A valid scheduledAt date/time is required (ISO 8601)"
    );
  }

  if (scheduledDate <= new Date()) {
    return fail(res, 400, "scheduledAt must be a future date/time");
  }

  if (!["cash", "wallet", "razorpay", "upi"].includes(paymentMethod)) {
    return fail(res, 400, "Invalid payment method");
  }

  const existing = await InstantRequest.findOne({
    customer: req.user._id,
    status: { $in: ACTIVE },
  });

  if (existing) {
    return fail(res, 409, "You already have an active request", {
      requestId: existing._id,
    });
  }

  const nearby = await findNearbyPandits({
    lat,
    lng,
    pujaId,
    limit: 1,
  });

  if (!nearby.length) {
    return fail(res, 404, "No pandit is available near you right now");
  }

  const { breakdown, puja } = await computePujaFare({
    pujaId,
    withSamagri: Boolean(withSamagri),
    distanceKm: nearby[0].distanceKm,
    vendorCommissionPercent: nearby[0].vendor.commissionPercentage,
  });

  if (paymentMethod === "wallet") {
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet || wallet.balance < breakdown.totalAmount) {
      return fail(res, 402, "Insufficient wallet balance", {
        required: breakdown.totalAmount,
      });
    }
  }

  const dispatchSettings = await getDispatchSettings();

  const request = await InstantRequest.create({
    customer: req.user._id,
    puja: puja._id,
    pujaName: puja.name,
    withSamagri: Boolean(withSamagri),
    scheduledAt: scheduledDate,
    pickup: {
      type: "Point",
      coordinates: [lng, lat],
    },
    address: String(address).trim(),
    city,
    pincode,
    notes,
    paymentMethod,
    fare: breakdown,
    radiusKm: Number(
      dispatchSettings.defaultRadiusKm ||
        process.env.INSTANT_RADIUS_KM ||
        10
    ),
    searchExpiresAt: new Date(
      Date.now() + SEARCH_TIMEOUT_SEC() * 1000
    ),
  });

  await offerNext(request._id);

  const fresh = await InstantRequest.findById(request._id);

  res.status(201).json({
    success: true,
    message: "Booking is processing while we find a Pandit",
    request: publicRequest(fresh, { customerView: true }),
  });
});

exports.getActive = handle("getActive", async (req, res) => {
  const request = await InstantRequest.findOne({
    customer: req.user._id,
    status: { $in: ACTIVE },
  });

  if (!request) {
    return res.json({ success: true, request: null });
  }

  return exports._sendRequest(req, res, request);
});

exports.getRequest = handle("getRequest", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(res, 400, "Invalid request ID");
  }

  const request = await InstantRequest.findById(req.params.id);

  if (!request) {
    return fail(res, 404, "Request not found");
  }

  return exports._sendRequest(req, res, request);
});

exports._sendRequest = async (req, res, request) => {
  const isCustomer =
    String(request.customer) === String(req.user._id);

  const vendor = await Vendor.findOne({
    user: req.user._id,
  }).select("_id");

  const isVendor =
    vendor &&
    String(request.assignedVendor) === String(vendor._id);

  if (!isCustomer && !isVendor && req.user.role !== "admin") {
    return fail(res, 403, "Access denied");
  }

  let otp = null;

  if (
    isCustomer &&
    request.booking &&
    ["accepted", "arrived"].includes(request.status)
  ) {
    const booking = await Booking.findById(request.booking)
      .select("+serviceOtp");

    otp = booking?.serviceOtp || null;
  }

  let pandit = null;

  if (request.assignedVendor) {
    // Never fetch or return the Pandit's mobile number to the customer.
    const v = await Vendor.findById(request.assignedVendor).select(
      "name profileImage experience bio city state location user"
    );

    if (v) {
      const [vLng, vLat] = v.location?.coordinates || [];
      const [pLng, pLat] = request.pickup.coordinates;

      const km =
        vLat !== undefined
          ? haversineKm(vLat, vLng, pLat, pLng)
          : null;

      pandit = {
        id: v._id,
        name: v.name,
        profileImage: v.profileImage,
        experience: v.experience,
        bio: v.bio,
        city: v.city,
        state: v.state,
        location:
          vLat !== undefined
            ? { latitude: vLat, longitude: vLng }
            : null,
        distanceKm: km !== null ? Math.round(km * 10) / 10 : null,
        etaMinutes:
          km !== null && request.status === "accepted"
            ? etaMinutes(km)
            : null,
      };
    }
  }

  res.json({
    success: true,
    request: publicRequest(request, {
      showOtp: isCustomer,
      otp,
      customerView: isCustomer,
    }),
    pandit,
  });
};

exports.cancelRequest = handle("cancelRequest", async (req, res) => {
  const reason = String(req.body.reason || "").slice(0, 300);

  const request = await InstantRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      customer: req.user._id,
      status: { $in: ["searching", "accepted", "arrived"] },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: "customer",
        cancelReason: reason,
        currentOfferVendor: null,
        offerExpiresAt: null,
      },
    },
    { new: true }
  );

  if (!request) {
    return fail(res, 409, "Request cannot be cancelled now");
  }

  if (request.assignedVendor) {
    await Vendor.updateOne(
      { _id: request.assignedVendor },
      { $set: { activeInstantRequest: null } }
    );
  }

  if (request.booking) {
    await Booking.updateOne(
      {
        _id: request.booking,
        status: { $in: ["confirmed", "pending"] },
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancellation: {
            cancelledBy: "customer",
            reason,
            cancelledAt: new Date(),
          },
        },
      }
    );
  }

  broadcast(request);

  res.json({
    success: true,
    message: "Request cancelled",
    request: publicRequest(request),
  });
});

// ======================================================
// PANDIT
// ======================================================

exports.setOnline = handle("setOnline", async (req, res) => {
  const vendor = await getPandit(req.user._id);

  if (!vendor) {
    return fail(res, 403, "Approved pandit profile required");
  }

  const online = Boolean(req.body.online);
  const update = { isOnline: online };

  if (online) {
    const lat = Number(req.body.latitude);
    const lng = Number(req.body.longitude);

    if (!validCoords(lat, lng)) {
      return fail(res, 400, "Location is required to go online");
    }

    update.location = {
      type: "Point",
      coordinates: [lng, lat],
    };
    update.locationUpdatedAt = new Date();
  }

  await Vendor.updateOne(
    { _id: vendor._id },
    { $set: update }
  );

  await require("../models/User").updateOne(
    { _id: req.user._id },
    { $set: { online } }
  );

  res.json({ success: true, online });
});

exports.updateLocation = handle("updateLocation", async (req, res) => {
  const vendor = await getPandit(req.user._id);

  if (!vendor) {
    return fail(res, 403, "Approved pandit profile required");
  }

  const result = await exports.applyLocation(vendor, req.body);

  if (!result.ok) {
    return fail(res, 400, result.message);
  }

  res.json({ success: true });
});

/**
 * Shared by REST and socket.
 * Saves live location and sends tracking updates to the customer.
 */
exports.applyLocation = async (
  vendor,
  { latitude, longitude, heading = null }
) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!validCoords(lat, lng)) {
    return {
      ok: false,
      message: "Valid latitude and longitude are required",
    };
  }

  await Vendor.updateOne(
    { _id: vendor._id },
    {
      $set: {
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        locationUpdatedAt: new Date(),
      },
    }
  );

  if (vendor.activeInstantRequest) {
    const request = await InstantRequest.findOne({
      _id: vendor.activeInstantRequest,
      status: { $in: ["accepted", "arrived", "in_progress"] },
    }).select("customer pickup status");

    if (request) {
      const [pLng, pLat] = request.pickup.coordinates;
      const km = haversineKm(lat, lng, pLat, pLng);

      emitToUser(request.customer, "tracking:update", {
        requestId: request._id,
        status: request.status,
        latitude: lat,
        longitude: lng,
        heading,
        distanceKm: Math.round(km * 10) / 10,
        etaMinutes:
          request.status === "accepted" ? etaMinutes(km) : 0,
        ts: Date.now(),
      });
    }
  }

  return { ok: true };
};
exports.getOffer = handle("getOffer", async (req, res) => {
  const vendor = await getPandit(req.user._id);

  if (!vendor) {
    return fail(res, 403, "Approved pandit profile required");
  }

  const request = await InstantRequest.findOne({
    status: "searching",
    currentOfferVendor: vendor._id,
    offerExpiresAt: { $gt: new Date() },
  });

  if (!request) {
    return res.json({ success: true, offer: null });
  }

  const [lng, lat] = request.pickup.coordinates;
  const [vendorLng, vendorLat] =
    vendor.location?.coordinates || [lng, lat];

  const km = haversineKm(vendorLat, vendorLng, lat, lng);

  res.json({
    success: true,
    offer: {
      requestId: request._id,
      pujaName: request.pujaName,
      address: request.address,
      pickup: {
        latitude: lat,
        longitude: lng,
      },
      scheduledAt: request.scheduledAt,
      distanceKm: Math.round(km * 10) / 10,
      etaMinutes: etaMinutes(km),
      earning: request.fare?.vendorAmount,
      paymentMethod: request.paymentMethod,
      expiresAt: request.offerExpiresAt,
    },
  });
});

exports.declineRequest = handle("declineRequest", async (req, res) => {
  const vendor = await getPandit(req.user._id);

  if (!vendor) {
    return fail(res, 403, "Approved pandit profile required");
  }

  const closed = await closeCurrentOffer({
    requestId: req.params.id,
    response: "declined",
    vendorId: vendor._id,
  });

  if (!closed) {
    return fail(res, 409, "Offer is no longer available");
  }

  await offerNext(closed._id);

  res.json({
    success: true,
    message: "Request declined",
  });
});

exports.acceptRequest = handle("acceptRequest", async (req, res) => {
  const vendor = await getPandit(req.user._id);

  if (!vendor) {
    return fail(res, 403, "Approved pandit profile required");
  }

  const now = new Date();

  const request = await InstantRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "searching",
      currentOfferVendor: vendor._id,
      offerExpiresAt: { $gt: now },
    },
    {
      $set: {
        status: "accepted",
        assignedVendor: vendor._id,
        acceptedAt: now,
        currentOfferVendor: null,
        offerExpiresAt: null,
        "candidates.$[c].response": "accepted",
        "candidates.$[c].respondedAt": now,
      },
    },
    {
      new: true,
      arrayFilters: [{ "c.response": "pending" }],
    }
  );

  if (!request) {
    return fail(res, 409, "This request is no longer available");
  }

  // A Pandit can only hold one active instant job.
  const locked = await Vendor.findOneAndUpdate(
    {
      _id: vendor._id,
      activeInstantRequest: null,
    },
    {
      $set: {
        activeInstantRequest: request._id,
      },
    }
  );

  if (!locked) {
    await InstantRequest.updateOne(
      { _id: request._id },
      {
        $set: {
          status: "searching",
          assignedVendor: null,
          acceptedAt: null,
          "candidates.$[c].response": "declined",
        },
      },
      {
        arrayFilters: [{ "c.vendor": vendor._id }],
      }
    );

    await offerNext(request._id);

    return fail(res, 409, "You already have an active job");
  }

  let booking;
  const startOtp = generateOtp();

  try {
    const fare = request.fare;
    const [lng, lat] = request.pickup.coordinates;
    const scheduledDate = new Date(request.scheduledAt);

    const bookingDate = scheduledDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    const bookingStartTime = scheduledDate.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    booking = await Booking.create({
      customer: request.customer,
      vendor: vendor._id,
      serviceType: "puja",
      title: `${request.pujaName} (Instant)`,
      description: request.notes || "",
      puja: request.puja,
      pujaName: request.pujaName,

      scheduledDate: bookingDate,
      startTime: bookingStartTime,
      timezone: "Asia/Kolkata",

      address: request.address,
      city: request.city,
      pincode: request.pincode,
      latitude: lat,
      longitude: lng,

      amount:
        fare.pujaPrice +
        fare.samagriPrice +
        fare.travelCharge,

      baseAmount:
        fare.pujaPrice +
        fare.samagriPrice +
        fare.travelCharge,

      platformFee: fare.platformFee,
      taxAmount: fare.taxAmount,
      totalAmount: fare.totalAmount,
      commissionPercentage: fare.commissionPercentage,
      commissionAmount: fare.commissionAmount,
      vendorAmount: fare.vendorAmount,

      paymentMethod:
        request.paymentMethod === "upi"
          ? "upi"
          : request.paymentMethod,

      paymentStatus: "pending",

      // Booking is confirmed only after Pandit acceptance.
      status: "confirmed",
      confirmedAt: now,
      source: "app",

      serviceOtp: startOtp,
      serviceOtpExpiresAt: new Date(
        Date.now() + 6 * 60 * 60 * 1000
      ),

      metadata: {
        instantRequest: String(request._id),
        instant: true,
      },
    });
  } catch (error) {
    console.error("Instant booking create failed:", error);

    await Vendor.updateOne(
      { _id: vendor._id },
      { $set: { activeInstantRequest: null } }
    );

    await InstantRequest.updateOne(
      { _id: request._id },
      {
        $set: {
          status: "searching",
          assignedVendor: null,
          acceptedAt: null,
        },
      }
    );

    await offerNext(request._id);

    return fail(
      res,
      500,
      "Could not create booking, please retry"
    );
  }

  request.booking = booking._id;
  await request.save();

  // Customer transitions from Processing to Confirmed.
  emitToUser(request.customer, "instant:update", {
    requestId: request._id,
    status: "accepted",
    bookingStatus: "confirmed",
    pandit: {
      id: vendor._id,
      name: vendor.name,
      profileImage: vendor.profileImage,
      experience: vendor.experience,
    },
  });

  try {
    await notifyUser({
      userId: request.customer,
      title: "Booking confirmed",
      message:
        `${vendor.name} accepted your puja booking. ` +
        "Your booking is now confirmed. Share the start OTP only when " +
        `the Pandit arrives. OTP: ${startOtp}`,
      type: "booking_accepted",
      priority: "high",
      referenceId: request._id,
      referenceType: "InstantRequest",
      data: {
        requestId: String(request._id),
        bookingId: String(booking._id),
        bookingStatus: "confirmed",
      },
    });
  } catch (error) {
    console.error("Booking confirmation notification failed:", error.message);
  }

  res.json({
    success: true,
    message: "Request accepted and booking confirmed",
    request: publicRequest(request),
    bookingId: booking._id,
  });
});

const loadAssigned = async (req, res, allowed) => {
  const vendor = await getPandit(req.user._id);

  if (!vendor) {
    fail(res, 403, "Approved pandit profile required");
    return null;
  }

  const request = await InstantRequest.findOne({
    _id: req.params.id,
    assignedVendor: vendor._id,
    status: { $in: allowed },
  }).select("+endOtpHash +endOtpExpiresAt +endOtpAttempts");

  if (!request) {
    fail(
      res,
      409,
      `Request must be in status: ${allowed.join(" / ")}`
    );
    return null;
  }

  return { vendor, request };
};

exports.markArrived = handle("markArrived", async (req, res) => {
  const ctx = await loadAssigned(req, res, ["accepted"]);
  if (!ctx) return;

  const { vendor, request } = ctx;

  const maxMeters = Number(
    process.env.ARRIVAL_RADIUS_METERS || 500
  );

  const fresh = await Vendor.findById(vendor._id)
    .select("location locationUpdatedAt");

  if (!fresh.location?.coordinates) {
    return fail(res, 400, "Your location is unknown. Enable GPS.");
  }

  const [vendorLng, vendorLat] = fresh.location.coordinates;
  const [pujaLng, pujaLat] = request.pickup.coordinates;

  const meters =
    haversineKm(vendorLat, vendorLng, pujaLat, pujaLng) * 1000;

  if (meters > maxMeters) {
    return fail(
      res,
      400,
      `You are ${Math.round(meters)} m away. ` +
        `Reach within ${maxMeters} m to mark arrived.`
    );
  }

  request.status = "arrived";
  request.arrivedAt = new Date();

  await request.save();
  broadcast(request);

  try {
    await notifyUser({
      userId: request.customer,
      title: "Pandit has arrived",
      message: "Share the start OTP with your Pandit to begin the puja.",
      type: "booking_started",
      referenceId: request._id,
      referenceType: "InstantRequest",
    });
  } catch (error) {
    console.error("Arrival notification failed:", error.message);
  }

  res.json({
    success: true,
    request: publicRequest(request),
  });
});

exports.startService = handle("startService", async (req, res) => {
  const ctx = await loadAssigned(req, res, ["arrived"]);
  if (!ctx) return;

  const { request } = ctx;

  const booking = await Booking.findById(request.booking).select(
    "+serviceOtp +serviceOtpExpiresAt +serviceOtpAttempts"
  );

  if (!booking) {
    return fail(res, 404, "Booking not found");
  }

  if (booking.serviceOtpVerified) {
    return fail(res, 409, "Start OTP has already been verified");
  }

  if (
    booking.serviceOtpExpiresAt &&
    booking.serviceOtpExpiresAt <= new Date()
  ) {
    return fail(res, 400, "Start OTP expired. Contact support.");
  }

  if ((booking.serviceOtpAttempts || 0) >= 5) {
    return fail(res, 429, "Too many wrong attempts. Contact support.");
  }

  const suppliedOtp = String(req.body.otp || "");
  const expectedOtp = String(booking.serviceOtp || "");

  const isValid =
    suppliedOtp.length === expectedOtp.length &&
    crypto.timingSafeEqual(
      Buffer.from(suppliedOtp),
      Buffer.from(expectedOtp)
    );

  if (!isValid) {
    booking.serviceOtpAttempts =
      (booking.serviceOtpAttempts || 0) + 1;

    await booking.save();

    return fail(res, 400, "Incorrect OTP");
  }

  booking.serviceOtpVerified = true;
  booking.serviceOtpVerifiedAt = new Date();
  booking.status = "in_progress";
  booking.startedAt = new Date();

  await booking.save();

  request.status = "in_progress";
  request.startedAt = new Date();
  request.startOtpVerifiedAt = new Date();

  await request.save();
  broadcast(request);

  res.json({
    success: true,
    message: "Puja started",
    request: publicRequest(request),
  });
});

exports.completeService = handle("completeService", async (req, res) => {
  const ctx = await loadAssigned(req, res, ["in_progress"]);
  if (!ctx) return;

  const { vendor, request } = ctx;
  const booking = await Booking.findById(request.booking);

  if (!booking) {
    return fail(res, 404, "Booking not found");
  }

  // First call generates and sends a separate completion OTP.
  // The next call must provide that OTP to complete the puja.
  const suppliedOtp = String(req.body.otp || "").trim();

  if (!request.endOtpHash) {
    const endOtp = generateOtp();

    request.endOtpHash = hashOtp(endOtp);
    request.endOtpExpiresAt = new Date(
      Date.now() + 15 * 60 * 1000
    );
    request.endOtpAttempts = 0;

    await request.save();

    try {
      await notifyUser({
        userId: request.customer,
        title: "Puja completion OTP",
        message:
          "Share this OTP with your Pandit only after the puja is finished: " +
          `${endOtp}. It expires in 15 minutes.`,
        type: "booking_completed",
        priority: "high",
        referenceId: request._id,
        referenceType: "InstantRequest",
        data: {
          requestId: String(request._id),
          purpose: "end_otp",
        },
      });
    } catch (error) {
      console.error("End OTP notification failed:", error.message);
    }

    emitToUser(request.customer, "instant:end-otp-issued", {
      requestId: request._id,
      expiresAt: request.endOtpExpiresAt,
    });

    return res.json({
      success: true,
      requiresEndOtp: true,
      message:
        "Completion OTP sent to customer. Verify it to finish the puja.",
    });
  }

  if ((request.endOtpAttempts || 0) >= 5) {
    return fail(
      res,
      429,
      "Too many wrong completion OTP attempts. Contact support."
    );
  }

  if (
    !request.endOtpExpiresAt ||
    request.endOtpExpiresAt <= new Date()
  ) {
    return fail(
      res,
      400,
      "Completion OTP expired. Ask support to issue a new OTP."
    );
  }

  if (!suppliedOtp) {
    return fail(res, 400, "Customer completion OTP is required");
  }

  const suppliedHash = hashOtp(suppliedOtp);

  const validOtp =
    suppliedHash.length === request.endOtpHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(suppliedHash),
      Buffer.from(request.endOtpHash)
    );

  if (!validOtp) {
    request.endOtpAttempts =
      (request.endOtpAttempts || 0) + 1;

    await request.save();

    return fail(res, 400, "Incorrect completion OTP", {
      attemptsRemaining: Math.max(
        0,
        5 - request.endOtpAttempts
      ),
    });
  }

  // Preserve the existing payment behavior.
  if (booking.paymentMethod === "cash") {
    booking.paymentStatus = "paid";
    booking.paidAt = new Date();
  } else if (
    booking.paymentMethod === "wallet" &&
    booking.paymentStatus !== "paid"
  ) {
    try {
      await debitWallet({
        userId: booking.customer,
        amount: booking.totalAmount,
        category: "booking",
        referenceId: `BOOKING-PAY-${booking._id}`,
        booking: booking._id,
        description: `Payment for ${booking.title}`,
      });

      booking.paymentStatus = "paid";
      booking.paidAt = new Date();
    } catch (error) {
      booking.paymentStatus = "failed";
      console.error("Wallet debit failed:", error.message);
    }
  }

  booking.status = "completed";
  booking.completedAt = new Date();
  booking.reviewEligible = true;

  await booking.save();

  request.status = "completed";
  request.endOtpVerifiedAt = new Date();
  request.completedAt = new Date();
  request.endOtpHash = "";
  request.endOtpExpiresAt = null;

  await request.save();

  await Vendor.updateOne(
    {
      _id: vendor._id,
      activeInstantRequest: request._id,
    },
    {
      $set: { activeInstantRequest: null },
    }
  );

  let earning = null;

  try {
    ({ earning } = await settleBookingEarning(booking));
  } catch (error) {
    console.error("Earning settlement failed:", error);
  }

  broadcast(request, {
    paymentStatus: booking.paymentStatus,
    reviewEligible: true,
  });

  // Both participants are notified that reviews are available.
  for (const recipient of [request.customer, vendor.user]) {
    try {
      const isCustomer =
        recipient.toString() === request.customer.toString();

      await notifyUser({
        userId: recipient,
        title: "Puja completed — leave a review",
        message: isCustomer
          ? "Please rate your Pandit and share your experience."
          : "Please rate the customer and share your experience.",
        type: "booking_completed",
        priority: "high",
        referenceId: request._id,
        referenceType: "InstantRequest",
        data: {
          requestId: String(request._id),
          bookingId: String(booking._id),
          reviewAvailable: true,
        },
      });
    } catch (error) {
      console.error("Review notification failed:", error.message);
    }
  }

  res.json({
    success: true,
    message: "Service completed and completion OTP verified",
    paymentStatus: booking.paymentStatus,
    reviewEligible: true,
    reviewEndpoints: {
      customer: `/api/partner/instant/${request._id}/reviews/customer`,
      pandit: `/api/partner/instant/${request._id}/reviews/pandit`,
    },
    earning: earning
      ? {
          netAmount: earning.netAmount,
          status: earning.status,
        }
      : null,
  });
});

/**
 * If an assigned Pandit cancels before starting, release the job
 * and offer it to the next eligible Pandit.
 */
exports.panditCancel = handle("panditCancel", async (req, res) => {
  const ctx = await loadAssigned(req, res, ["accepted", "arrived"]);
  if (!ctx) return;

  const { vendor, request } = ctx;
  const reason = String(req.body.reason || "Pandit cancelled");

  await Booking.updateOne(
    { _id: request.booking },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancellation: {
          cancelledBy: "vendor",
          reason,
          cancelledAt: new Date(),
        },
      },
    }
  );

  await Vendor.updateOne(
    { _id: vendor._id },
    { $set: { activeInstantRequest: null } }
  );

  request.status = "searching";
  request.assignedVendor = null;
  request.booking = null;
  request.acceptedAt = null;
  request.arrivedAt = null;
  request.searchExpiresAt = new Date(
    Date.now() + SEARCH_TIMEOUT_SEC() * 1000
  );

  await request.save();

  emitToUser(request.customer, "instant:update", {
    requestId: request._id,
    status: "processing",
    message: "Your Pandit cancelled. Finding another Pandit...",
  });

  await offerNext(request._id);

  res.json({
    success: true,
    message: "Job released; finding another Pandit",
  });
});