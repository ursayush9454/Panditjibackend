
const Inquiry = require("../models/Inquiry");
const Vendor = require("../models/Vendor");
const Booking = require("../models/Booking");
const { config, round } = require("../services/pricingService");
const { notifyUser } = require("../services/notificationService");

const RADIUS_METERS = 5000;
const MINIMUM_NOTICE_MS = 48 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = "Asia/Kolkata";

const getUserId = (req) => req.user?.id || req.user?._id;

const getMandali = async (userId) =>
  Vendor.findOne({ user: userId, role: "mandali" });

const validCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    latitude !== undefined &&
    longitude !== undefined &&
    latitude !== null &&
    longitude !== null &&
    latitude !== "" &&
    longitude !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

// Date-only values are interpreted as India local time.
// Full ISO datetime values with Z/offset are accepted as supplied.
const parseEventDateTime = (eventDate, eventTime) => {
  if (!eventDate) return null;

  const dateText = String(eventDate).trim();
  let timeText = eventTime ? String(eventTime).trim() : "";

  if (!timeText && /^\d{4}-\d{2}-\d{2}T/.test(dateText)) {
    const match = dateText.match(/T(\d{2}:\d{2})/);
    if (match) timeText = match[1];
  }

  if (!timeText || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeText)) {
    return null;
  }

  let parsed;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    parsed = new Date(`${dateText}T${timeText}:00+05:30`);
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateText)) {
    const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateText);
    parsed = new Date(hasZone ? dateText : `${dateText}+05:30`);
  } else {
    return null;
  }

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

  const part = (type) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const notifySafely = async (payload) => {
  try {
    await notifyUser(payload);
  } catch (error) {
    console.error("Mandali notification failed:", error.message);
  }
};

// CUSTOMER: Create request and notify approved Mandalis within 5 km.
exports.createInquiry = async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      name,
      phone,
      eventType,
      eventDate,
      eventTime,
      timezone = DEFAULT_TIMEZONE,
      location,
      latitude,
      longitude,
      guestCount,
      budget,
      message,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!name || !phone || !eventType || !eventDate || !location) {
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
        message: "Invalid event date/time. Send eventDate as YYYY-MM-DD or ISO datetime and eventTime as HH:mm",
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

    if (!Number.isFinite(guests) || guests < 0 ||
        !Number.isFinite(customerBudget) || customerBudget < 0) {
      return res.status(400).json({
        success: false,
        message: "Guest count and budget must be valid non-negative numbers",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    // MongoDB's 2dsphere index finds eligible vendors by distance.
    const candidates = await Vendor.find({
      role: "mandali",
      status: "approved",
      "location.type": "Point",
      "location.coordinates": { $exists: true },
    }).where("location").near({
      center: {
        type: "Point",
        coordinates: [lng, lat],
      },
      maxDistance: RADIUS_METERS,
      spherical: true,
    }).select("_id user name serviceRadiusKm location");

    const nearbyMandalis = candidates.filter((vendor) => {
      const coords = vendor.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return false;

      const vendorLng = Number(coords[0]);
      const vendorLat = Number(coords[1]);
      if (!Number.isFinite(vendorLng) || !Number.isFinite(vendorLat)) return false;

      // Haversine check keeps the 5 km boundary explicit.
      const rad = (v) => (v * Math.PI) / 180;
      const dLat = rad(vendorLat - lat);
      const dLng = rad(vendorLng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat)) *
          Math.cos(rad(vendorLat)) *
          Math.sin(dLng / 2) ** 2;
      const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const configuredRadius = Number(vendor.serviceRadiusKm || 5);

      vendor.$locals.distanceKm = Math.round(distanceKm * 100) / 100;
      return distanceKm <= 5 && distanceKm <= configuredRadius;
    });

    if (!nearbyMandalis.length) {
      return res.status(404).json({
        success: false,
        message: "No approved Bhajan Mandli found within 5 km. Please try another event location.",
      });
    }

    const inquiryDocs = nearbyMandalis.map((mandali) => ({
      mandali: mandali._id,
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
      distanceKm: mandali.$locals.distanceKm,
      guestCount: guests,
      budget: customerBudget,
      message: message ? String(message).trim() : "",
      status: "pending",
    }));

    const created = await Inquiry.insertMany(inquiryDocs);

    await Promise.all(
      nearbyMandalis.map((mandali, index) =>
        notifySafely({
          userId: mandali.user,
          title: "New Bhajan Mandli booking request",
          message: `${String(eventType).trim()} request for ${schedule.time} on ${localDateInTimezone(schedule.date, timezone || DEFAULT_TIMEZONE)}. Event is within 5 km of your registered location.`,
          type: "booking_created",
          referenceId: created[index]._id,
          referenceType: "inquiry",
          data: {
            inquiryId: String(created[index]._id),
            eventType: String(eventType).trim(),
            eventDate: schedule.date.toISOString(),
            eventTime: schedule.time,
            distanceKm: mandali.$locals.distanceKm,
          },
        })
      )
    );

    return res.status(201).json({
      success: true,
      message: `Request sent to ${created.length} approved Mandali vendor(s) within 5 km`,
      count: created.length,
      inquiries: created,
    });
  } catch (error) {
    console.error("Create Mandali Inquiry Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Mandli booking request",
    });
  }
};

// MANDALI: List own requests.
exports.getInquiries = async (req, res) => {
  try {
    const mandali = await getMandali(getUserId(req));
    if (!mandali) {
      return res.status(404).json({ success: false, message: "Mandali profile not found" });
    }

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

// CUSTOMER: List own requests.
exports.getMyInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find({ customer: getUserId(req) })
      .populate("mandali", "name phone city state role")
      .sort({ createdAt: -1 });

    return res.json({ success: true, count: inquiries.length, inquiries });
  } catch (error) {
    console.error("Get Customer Inquiries Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiries" });
  }
};

// CUSTOMER OR THE ASSIGNED MANDALI: Get one inquiry.
exports.getInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate("mandali", "name phone city state role")
      .populate("customer", "phone role status");

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    const userId = String(getUserId(req));
    const isCustomer = String(inquiry.customer?._id || inquiry.customer) === userId;
    const mandali = await getMandali(getUserId(req));
    const isMandali = mandali && String(mandali._id) === String(inquiry.mandali?._id || inquiry.mandali);

    if (!isCustomer && !isMandali) {
      return res.status(403).json({ success: false, message: "You are not allowed to view this inquiry" });
    }

    return res.json({ success: true, inquiry });
  } catch (error) {
    console.error("Get Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiry" });
  }
};

// MANDALI: Send a quote or reject the request.
exports.respondToInquiry = async (req, res) => {
  try {
    const mandali = await getMandali(getUserId(req));
    if (!mandali) {
      return res.status(404).json({ success: false, message: "Mandali profile not found" });
    }

    if (mandali.status !== "approved") {
      return res.status(403).json({ success: false, message: "Mandali is not approved" });
    }

    const { status, responseMessage, quotedAmount } = req.body;
    const inquiry = await Inquiry.findOne({
      _id: req.params.id,
      mandali: mandali._id,
    });

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    if (inquiry.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending inquiries can be responded to",
      });
    }

    if (!["responded", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be responded or rejected",
      });
    }

    if (status === "responded") {
      const amount = Number(quotedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "A valid quotedAmount greater than zero is required",
        });
      }
      inquiry.quotedAmount = amount;
    }

    inquiry.responseMessage = responseMessage ? String(responseMessage).trim() : "";
    inquiry.status = status;
    inquiry.respondedAt = new Date();

    await inquiry.save();

    await notifySafely({
      userId: inquiry.customer,
      title: status === "responded" ? "Bhajan Mandli sent a quote" : "Bhajan Mandli declined",
      message: status === "responded"
        ? `${mandali.name || "A Bhajan Mandli"} sent a quote of ₹${inquiry.quotedAmount}.`
        : `${mandali.name || "A Bhajan Mandli"} cannot take this event.`,
      type: status === "responded" ? "booking_created" : "general",
      referenceId: inquiry._id,
      referenceType: "inquiry",
    });

    return res.json({ success: true, message: "Inquiry response saved", inquiry });
  } catch (error) {
    console.error("Respond Mandali Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to respond to inquiry" });
  }
};

// CUSTOMER: Cancel one of their requests.
exports.cancelInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({
      _id: req.params.id,
      customer: getUserId(req),
    });

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    if (["accepted", "completed", "cancelled"].includes(inquiry.status)) {
      return res.status(400).json({
        success: false,
        message: "This inquiry can no longer be cancelled",
      });
    }

    inquiry.status = "cancelled";
    await inquiry.save();

    return res.json({ success: true, message: "Inquiry cancelled", inquiry });
  } catch (error) {
    console.error("Cancel Mandali Inquiry Error:", error);
    return res.status(500).json({ success: false, message: "Failed to cancel inquiry" });
  }
};

// CUSTOMER: Accept a quote and create the existing advance-payment booking.
exports.acceptQuote = async (req, res) => {
  let claimedInquiryId;

  try {
    const userId = getUserId(req);
    const inquiry = await Inquiry.findOne({
      _id: req.params.id,
      customer: userId,
    });

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    if (inquiry.status !== "responded" || !(inquiry.quotedAmount > 0)) {
      return res.status(400).json({
        success: false,
        message: "There is no quote to accept on this inquiry",
      });
    }

    if (inquiry.eventDate.getTime() < Date.now() + MINIMUM_NOTICE_MS) {
      return res.status(400).json({
        success: false,
        message: "The event must still be at least 48 hours in the future",
      });
    }

    const mandali = await Vendor.findOne({
      _id: inquiry.mandali,
      role: "mandali",
      status: "approved",
    });

    if (!mandali) {
      return res.status(404).json({ success: false, message: "Mandali is no longer available" });
    }

    // Atomic claim prevents double taps from creating duplicate bookings.
    const claimed = await Inquiry.findOneAndUpdate(
      { _id: inquiry._id, status: "responded", booking: null },
      { $set: { status: "accepted" } },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({ success: false, message: "Quote has already been accepted" });
    }

    claimedInquiryId = claimed._id;

    const amount = round(claimed.quotedAmount);
    const pct = mandali.commissionPercentage !== null &&
      mandali.commissionPercentage !== undefined
      ? mandali.commissionPercentage
      : config().commissionPercent;

    const commissionAmount = round((amount * pct) / 100);
    const advancePercent = Number(
      claimed.advancePercent || process.env.MANDALI_ADVANCE_PERCENT || 25
    );

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
        guestCount: claimed.guestCount,
        advancePercent,
        eventDateTime: claimed.eventDate.toISOString(),
      },
    });

    claimed.booking = booking._id;
    await claimed.save();

    await notifySafely({
      userId: mandali.user,
      title: "Customer accepted your quote",
      message: `${claimed.name} accepted your quote of ₹${amount}. Advance payment is pending.`,
      type: "booking_created",
      referenceId: booking._id,
      referenceType: "booking",
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

    // Restore inquiry if booking creation failed, allowing a safe retry.
    if (claimedInquiryId) {
      await Inquiry.updateOne(
        { _id: claimedInquiryId, booking: null, status: "accepted" },
        { $set: { status: "responded" } }
      ).catch(() => {});
    }

    return res.status(500).json({
      success: false,
      message: "Failed to accept quote",
    });
  }
};
