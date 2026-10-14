const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const Vendor = require("../models/Vendor");
const Booking = require("../models/Booking");
const MandaliDispatch = require("../models/MandaliDispatch");
const MandaliDispatchSettings = require("../models/MandaliDispatchSettings");
const { config, round } = require("../services/pricingService");
const { notifyUser } = require("../services/notificationService");
const {
  dispatchNextMandali,
  advanceAfterResponse,
  markDispatchQuoted,
  markDispatchAccepted,
  cancelMandaliDispatch,
} = require("../services/mandaliDispatchService");

const RADIUS_KM = 5;
const RADIUS_METERS = RADIUS_KM * 1000;
const OFFER_TIMEOUT_SECONDS = 120;
const MINIMUM_NOTICE_MS = 48 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = "Asia/Kolkata";

const getUserId = (req) => req.user?.id || req.user?._id;
const getMandali = async (userId) => Vendor.findOne({ user: userId, role: "mandali" });

const validCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null &&
    latitude !== "" && longitude !== "" && Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

// Date-only values are interpreted as India local time. ISO datetimes with a
// timezone/offset are accepted as supplied.
const parseEventDateTime = (eventDate, eventTime) => {
  if (!eventDate) return null;
  const dateText = String(eventDate).trim();
  let timeText = eventTime ? String(eventTime).trim() : "";
  if (!timeText && /^\d{4}-\d{2}-\d{2}T/.test(dateText)) {
    const match = dateText.match(/T(\d{2}:\d{2})/);
    if (match) timeText = match[1];
  }
  if (!timeText || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeText)) return null;

  let parsed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    parsed = new Date(`${dateText}T${timeText}:00+05:30`);
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateText)) {
    const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateText);
    parsed = new Date(hasZone ? dateText : `${dateText}+05:30`);
  } else return null;

  if (!Number.isFinite(parsed.getTime())) return null;
  return { date: parsed, time: timeText };
};

const localDateInTimezone = (date, timezone = DEFAULT_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const notifySafely = async (payload) => {
  try {
    await notifyUser(payload);
  } catch (error) {
    console.error("Mandali notification failed:", error.message);
  }
};

const getDispatchSettings = async () =>
  MandaliDispatchSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default", priorityVendorIds: [], radiusKm: RADIUS_KM, offerTimeoutSeconds: OFFER_TIMEOUT_SECONDS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// CUSTOMER: Create a single central request, then offer it to only one nearby
// Mandali at a time. The next Mandali receives it only after decline/timeout.
exports.createInquiry = async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      name, phone, eventType, eventDate, eventTime,
      timezone = DEFAULT_TIMEZONE, location, latitude, longitude,
      guestCount, budget, message,
    } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: "Authentication required" });
    if (!name || !phone || !eventType || !eventDate || !eventTime || !location) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, event type, date, time and event location are required",
      });
    }
    if (!validCoordinates(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        message: "Valid event latitude and longitude are required to find Mandalis within 5 km",
      });
    }

    const schedule = parseEventDateTime(eventDate, eventTime);
    if (!schedule) {
      return res.status(400).json({
        success: false,
        message: "Invalid event date/time. Send eventDate as YYYY-MM-DD and eventTime as HH:mm, or send a full ISO datetime",
      });
    }
    if (schedule.date.getTime() < Date.now() + MINIMUM_NOTICE_MS) {
      return res.status(400).json({
        success: false,
        message: "Bhajan Mandli booking must be made at least 48 hours before the event",
      });
    }

    const guests = Number(guestCount || 0);
    const customerBudget = Number(budget || 0);
    if (!Number.isFinite(guests) || guests < 0 || !Number.isFinite(customerBudget) || customerBudget < 0) {
      return res.status(400).json({ success: false, message: "Guest count and budget must be valid non-negative numbers" });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const candidates = await Vendor.find({
      role: "mandali",
      status: "approved",
      "location.type": "Point",
      "location.coordinates": { $exists: true },
    }).where("location").near({
      center: { type: "Point", coordinates: [lng, lat] },
      maxDistance: RADIUS_METERS,
      spherical: true,
    }).select("_id user name serviceRadiusKm location status");

    const nearbyMandalis = candidates.filter((vendor) => {
      const coordinates = vendor.location?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
      const vendorLng = Number(coordinates[0]);
      const vendorLat = Number(coordinates[1]);
      if (!Number.isFinite(vendorLng) || !Number.isFinite(vendorLat)) return false;
      const distanceKm = haversineKm(lat, lng, vendorLat, vendorLng);
      const vendorRadius = Number(vendor.serviceRadiusKm || RADIUS_KM);
      vendor.$locals.distanceKm = Math.round(distanceKm * 100) / 100;
      return distanceKm <= RADIUS_KM && distanceKm <= vendorRadius;
    });

    if (!nearbyMandalis.length) {
      return res.status(404).json({
        success: false,
        message: "No approved Bhajan Mandli found within 5 km. Please try another event location.",
      });
    }

    const settings = await getDispatchSettings();
    const priorityIds = (settings.priorityVendorIds || []).map((id) => String(id));
    const priorityIndex = new Map(priorityIds.map((id, index) => [id, index]));
    nearbyMandalis.sort((a, b) => {
      const aPriority = priorityIndex.has(String(a._id)) ? priorityIndex.get(String(a._id)) : Number.MAX_SAFE_INTEGER;
      const bPriority = priorityIndex.has(String(b._id)) ? priorityIndex.get(String(b._id)) : Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.$locals.distanceKm - b.$locals.distanceKm;
    });

    const dispatch = await MandaliDispatch.create({
      customer: userId,
      name: String(name).trim(),
      phone: String(phone).trim(),
      eventType: String(eventType).trim(),
      eventDate: schedule.date,
      eventTime: schedule.time,
      timezone: timezone || DEFAULT_TIMEZONE,
      location: String(location).trim(),
      latitude: lat,
      longitude: lng,
      guestCount: guests,
      budget: customerBudget,
      message: message ? String(message).trim() : "",
      radiusKm: RADIUS_KM,
      offerTimeoutSeconds: OFFER_TIMEOUT_SECONDS,
      currentIndex: -1,
      activeInquiry: null,
      activeVendor: null,
      activeExpiresAt: null,
      status: "pending",
      settingsSnapshot: { priorityVendorIds: priorityIds },
      candidates: nearbyMandalis.map((vendor) => ({
        vendor: vendor._id,
        vendorUser: vendor.user,
        distanceKm: vendor.$locals.distanceKm,
        state: "queued",
      })),
    });

    const firstOffer = await dispatchNextMandali(dispatch._id);
    await notifySafely({
      userId,
      title: "Bhajan Mandli request created",
      message: "Your request is pending. Nearby Mandalis are being contacted one at a time, with 2 minutes per Mandali to respond.",
      type: "mandali_booking_update",
      priority: "normal",
      data: { dispatchId: String(dispatch._id), status: "pending", radiusKm: RADIUS_KM, offerTimeoutSeconds: OFFER_TIMEOUT_SECONDS },
    });

    const currentDispatch = firstOffer.dispatch || await MandaliDispatch.findById(dispatch._id);
    return res.status(201).json({
      success: true,
      message: "Bhajan Mandli request created. Your booking is pending until a Mandali sends a quote.",
      status: currentDispatch?.status || "pending",
      dispatchId: String(dispatch._id),
      radiusKm: RADIUS_KM,
      offerTimeoutSeconds: OFFER_TIMEOUT_SECONDS,
      totalNearbyMandalis: nearbyMandalis.length,
      count: firstOffer.inquiry ? 1 : 0,
      inquiries: firstOffer.inquiry ? [firstOffer.inquiry] : [],
      currentPosition: currentDispatch?.currentIndex >= 0 ? currentDispatch.currentIndex + 1 : 0,
      activeExpiresAt: currentDispatch?.activeExpiresAt || null,
      inquiry: firstOffer.inquiry || null,
    });
  } catch (error) {
    console.error("Create Mandali Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create Mandli booking request" });
  }
};

// MANDALI: Own offers. In the new flow, only the currently offered inquiry is pending.
exports.getInquiries = async (req, res) => {
  try {
    const mandali = await getMandali(getUserId(req));
    if (!mandali) return res.status(404).json({ success: false, message: "Mandali profile not found" });

    const filter = { mandali: mandali._id };
    if (req.query.status) filter.status = req.query.status;
    const inquiries = await Inquiry.find(filter)
      .populate("customer", "phone role status")
      .sort({ createdAt: -1 });
    return res.json({ success: true, count: inquiries.length, inquiries });
  } catch (error) {
    console.error("Get Mandali Inquiries Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiries" });
  }
};

// CUSTOMER: Old frontend shape is preserved. A dispatches array adds the overall
// request status; expired/declined queue attempts are hidden from the main list.
exports.getMyInquiries = async (req, res) => {
  try {
    const customerId = getUserId(req);
    const [inquiries, dispatches] = await Promise.all([
      Inquiry.find({
        customer: customerId,
        $or: [
          { dispatchId: null },
          { dispatchId: { $exists: false } },
          { status: { $in: ["pending", "responded", "accepted"] } },
        ],
      }).populate("mandali", "name phone city state role")
        .sort({ createdAt: -1 }),
      MandaliDispatch.find({ customer: customerId }).sort({ createdAt: -1 }).limit(50)
        .select("_id status eventType eventDate eventTime location createdAt activeExpiresAt currentIndex candidates activeInquiry booking"),
    ]);

    const summaries = dispatches.map((dispatch) => ({
      _id: dispatch._id,
      status: dispatch.status,
      eventType: dispatch.eventType,
      eventDate: dispatch.eventDate,
      eventTime: dispatch.eventTime,
      location: dispatch.location,
      createdAt: dispatch.createdAt,
      activeExpiresAt: dispatch.activeExpiresAt,
      currentPosition: dispatch.currentIndex >= 0 ? dispatch.currentIndex + 1 : 0,
      totalNearbyMandalis: dispatch.candidates.length,
      activeInquiry: dispatch.activeInquiry,
      booking: dispatch.booking,
    }));

    return res.json({ success: true, count: inquiries.length, inquiries, dispatches: summaries });
  } catch (error) {
    console.error("Get Customer Inquiries Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiries" });
  }
};

exports.getMyDispatches = async (req, res) => {
  try {
    const dispatches = await MandaliDispatch.find({ customer: getUserId(req) })
      .sort({ createdAt: -1 }).limit(50)
      .select("_id status eventType eventDate eventTime location createdAt activeExpiresAt currentIndex candidates activeInquiry booking");
    return res.json({
      success: true,
      dispatches: dispatches.map((item) => ({
        _id: item._id,
        status: item.status,
        eventType: item.eventType,
        eventDate: item.eventDate,
        eventTime: item.eventTime,
        location: item.location,
        createdAt: item.createdAt,
        activeExpiresAt: item.activeExpiresAt,
        currentPosition: item.currentIndex >= 0 ? item.currentIndex + 1 : 0,
        totalNearbyMandalis: item.candidates.length,
        activeInquiry: item.activeInquiry,
        booking: item.booking,
      })),
    });
  } catch (error) {
    console.error("Get Mandali Dispatches Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch Mandali requests" });
  }
};

exports.getMyDispatch = async (req, res) => {
  try {
    const dispatch = await MandaliDispatch.findOne({ _id: req.params.id, customer: getUserId(req) })
      .select("_id status eventType eventDate eventTime location createdAt activeExpiresAt currentIndex candidates activeInquiry booking radiusKm offerTimeoutSeconds");
    if (!dispatch) return res.status(404).json({ success: false, message: "Mandali request not found" });
    return res.json({
      success: true,
      dispatch: {
        _id: dispatch._id,
        status: dispatch.status,
        eventType: dispatch.eventType,
        eventDate: dispatch.eventDate,
        eventTime: dispatch.eventTime,
        location: dispatch.location,
        createdAt: dispatch.createdAt,
        activeExpiresAt: dispatch.activeExpiresAt,
        currentPosition: dispatch.currentIndex >= 0 ? dispatch.currentIndex + 1 : 0,
        totalNearbyMandalis: dispatch.candidates.length,
        activeInquiry: dispatch.activeInquiry,
        booking: dispatch.booking,
        radiusKm: dispatch.radiusKm,
        offerTimeoutSeconds: dispatch.offerTimeoutSeconds,
      },
    });
  } catch (error) {
    console.error("Get Mandali Dispatch Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch Mandali request" });
  }
};

// CUSTOMER OR THE ASSIGNED MANDALI: Get one active/historical inquiry.
exports.getInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate("mandali", "name phone city state role")
      .populate("customer", "phone role status");
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    const userId = String(getUserId(req));
    const isCustomer = String(inquiry.customer?._id || inquiry.customer) === userId;
    const mandali = await getMandali(getUserId(req));
    const isMandali = mandali && String(mandali._id) === String(inquiry.mandali?._id || inquiry.mandali);
    if (!isCustomer && !isMandali) return res.status(403).json({ success: false, message: "You are not allowed to view this inquiry" });
    return res.json({ success: true, inquiry });
  } catch (error) {
    console.error("Get Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiry" });
  }
};

// MANDALI: Send a quote or decline. The queue only moves forward on decline or timeout.
exports.respondToInquiry = async (req, res) => {
  try {
    const mandali = await getMandali(getUserId(req));
    if (!mandali) return res.status(404).json({ success: false, message: "Mandali profile not found" });
    if (mandali.status !== "approved") return res.status(403).json({ success: false, message: "Mandali is not approved" });

    const { status, responseMessage, quotedAmount } = req.body || {};
    if (!["responded", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be responded or rejected" });
    }

    const existing = await Inquiry.findOne({ _id: req.params.id, mandali: mandali._id });
    if (!existing) return res.status(404).json({ success: false, message: "Inquiry not found" });
    if (existing.status !== "pending") return res.status(400).json({ success: false, message: "Only pending inquiries can be responded to" });

    if (existing.dispatchId) {
      const dispatch = await MandaliDispatch.findById(existing.dispatchId);
      if (!dispatch || dispatch.status !== "pending" || String(dispatch.activeInquiry) !== String(existing._id) || String(dispatch.activeVendor) !== String(mandali._id)) {
        return res.status(409).json({ success: false, message: "This offer has expired or is no longer active" });
      }
      if (dispatch.activeExpiresAt && dispatch.activeExpiresAt.getTime() <= Date.now()) {
        const expired = await Inquiry.findOneAndUpdate(
          { _id: existing._id, status: "pending" },
          { $set: { status: "rejected", responseMessage: "Offer expired: no response within 2 minutes", respondedAt: new Date() } },
          { new: true }
        );
        if (expired) await advanceAfterResponse(expired, "timed_out");
        return res.status(409).json({ success: false, message: "This offer expired after 2 minutes. The next nearby Mandali is being contacted." });
      }
    }

    let amount;
    if (status === "responded") {
      amount = Number(quotedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, message: "A valid quotedAmount greater than zero is required" });
      }
    }

    const values = {
      status,
      responseMessage: responseMessage ? String(responseMessage).trim() : "",
      respondedAt: new Date(),
    };
    if (status === "responded") values.quotedAmount = amount;

    // Atomic write prevents a timeout and a late response from both winning.
    const inquiry = await Inquiry.findOneAndUpdate(
      { _id: existing._id, status: "pending" },
      { $set: values },
      { new: true }
    );
    if (!inquiry) return res.status(409).json({ success: false, message: "This offer was already handled or expired" });

    if (inquiry.dispatchId) {
      if (status === "responded") await markDispatchQuoted(inquiry);
      else await advanceAfterResponse(inquiry, "declined");
    }

    await notifySafely({
      userId: inquiry.customer,
      title: status === "responded" ? "Bhajan Mandli sent a quote" : "Mandali declined the request",
      message: status === "responded"
        ? `${mandali.name || "A Bhajan Mandli"} sent a quote of ₹${inquiry.quotedAmount}. Review it and accept if suitable.`
        : `${mandali.name || "A Bhajan Mandli"} cannot take this event. We are contacting the next nearby Mandali.`,
      type: "mandali_booking_update",
      priority: "normal",
      referenceId: inquiry._id,
      referenceType: "Inquiry",
      data: { inquiryId: String(inquiry._id), dispatchId: inquiry.dispatchId ? String(inquiry.dispatchId) : "", status },
    });

    return res.json({ success: true, message: status === "responded" ? "Quote saved. The customer can now accept it." : "Request declined; the next Mandali is being contacted.", inquiry });
  } catch (error) {
    console.error("Respond Mandali Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to respond to inquiry" });
  }
};

// CUSTOMER: Cancel a request. For a queued request, cancellation stops the whole queue.
exports.cancelInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({ _id: req.params.id, customer: getUserId(req) });
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    if (["accepted", "completed", "cancelled"].includes(inquiry.status)) {
      return res.status(400).json({ success: false, message: "This inquiry can no longer be cancelled" });
    }

    if (inquiry.dispatchId) {
      await cancelMandaliDispatch(inquiry.dispatchId, getUserId(req));
    }
    inquiry.status = "cancelled";
    inquiry.responseMessage = "Cancelled by customer";
    await inquiry.save();
    return res.json({ success: true, message: "Mandali request cancelled", inquiry });
  } catch (error) {
    console.error("Cancel Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to cancel inquiry" });
  }
};

// CUSTOMER: Accept a quote and create the existing advance-payment booking.
exports.acceptQuote = async (req, res) => {
  let claimedInquiryId;
  try {
    const userId = getUserId(req);
    const inquiry = await Inquiry.findOne({ _id: req.params.id, customer: userId });
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    if (inquiry.status !== "responded" || !(inquiry.quotedAmount > 0)) {
      return res.status(400).json({ success: false, message: "There is no quote to accept on this inquiry" });
    }
    if (inquiry.eventDate.getTime() < Date.now() + MINIMUM_NOTICE_MS) {
      return res.status(400).json({ success: false, message: "The event must still be at least 48 hours in the future" });
    }

    const mandali = await Vendor.findOne({ _id: inquiry.mandali, role: "mandali", status: "approved" });
    if (!mandali) return res.status(404).json({ success: false, message: "Mandali is no longer available" });

    const claimed = await Inquiry.findOneAndUpdate(
      { _id: inquiry._id, status: "responded", booking: null },
      { $set: { status: "accepted" } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ success: false, message: "Quote has already been accepted" });
    claimedInquiryId = claimed._id;

    const amount = round(claimed.quotedAmount);
    const pct = mandali.commissionPercentage !== null && mandali.commissionPercentage !== undefined
      ? mandali.commissionPercentage
      : config().commissionPercent;
    const commissionAmount = round((amount * pct) / 100);
    const advancePercent = Number(claimed.advancePercent || process.env.MANDALI_ADVANCE_PERCENT || 25);
    const timezone = claimed.timezone || DEFAULT_TIMEZONE;
    const scheduledDate = localDateInTimezone(claimed.eventDate, timezone);

    const booking = await Booking.create({
      customer: claimed.customer,
      vendor: mandali._id,
      serviceType: "mandali",
      title: `${claimed.eventType} - Mandali booking`,
      description: claimed.message || "",
      scheduledDate,
      startTime: claimed.eventTime,
      timezone,
      address: claimed.location || "",
      latitude: claimed.latitude,
      longitude: claimed.longitude,
      amount,
      baseAmount: amount,
      totalAmount: amount,
      commissionPercentage: pct,
      commissionAmount,
      vendorAmount: round(amount - commissionAmount),
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      status: "pending",
      source: "app",
      metadata: {
        inquiry: String(claimed._id),
        dispatchId: claimed.dispatchId ? String(claimed.dispatchId) : "",
        guestCount: claimed.guestCount,
        advancePercent,
        eventDateTime: claimed.eventDate.toISOString(),
      },
    });

    claimed.booking = booking._id;
    await claimed.save();
    if (claimed.dispatchId) await markDispatchAccepted(claimed, booking._id);

    await notifySafely({
      userId: mandali.user,
      title: "Customer accepted your quote",
      message: `${claimed.name} accepted your quote of ₹${amount}. Advance payment is pending.`,
      type: "booking_created",
      referenceId: booking._id,
      referenceType: "Booking",
      data: { bookingId: String(booking._id), inquiryId: String(claimed._id) },
    });

    return res.status(201).json({
      success: true,
      message: "Quote accepted. Pay the advance to confirm the booking.",
      booking,
      advanceAmount: Math.round((amount * advancePercent) / 100),
      payWith: {
        endpoint: "/api/partner/payments/orders",
        body: { purpose: "mandali_advance", bookingId: booking._id },
      },
    });
  } catch (error) {
    console.error("Accept Mandali Quote Error:", error);
    if (claimedInquiryId) {
      await Inquiry.updateOne(
        { _id: claimedInquiryId, booking: null, status: "accepted" },
        { $set: { status: "responded" } }
      ).catch(() => {});
    }
    return res.status(500).json({ success: false, message: "Failed to accept quote" });
  }
};
