const Inquiry = require("../models/Inquiry");
const Vendor = require("../models/Vendor");
const Booking = require("../models/Booking");
const { config, round } = require("../services/pricingService");
const { notifyUser } = require("../services/notificationService");

// =====================================
// GET MANDALI
// =====================================
const getMandali = async (userId) => {
  return Vendor.findOne({
    user: userId,
    role: "mandali",
  });
};

// =====================================
// CREATE INQUIRY
// =====================================
exports.createInquiry = async (req, res) => {
  try {
    const {
      mandaliId,
      name,
      phone,
      eventType,
      eventDate,
      location,
      guestCount,
      budget,
      message,
    } = req.body;

    if (
      !mandaliId ||
      !name ||
      !phone ||
      !eventType
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Mandali, name, phone and event type are required",
      });
    }

    const mandali = await Vendor.findOne({
      _id: mandaliId,
      role: "mandali",
      status: "approved",
    });

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Approved mandali not found",
      });
    }

    const inquiry = await Inquiry.create({
      mandali: mandali._id,
      customer: req.user.id,
      name: String(name).trim(),
      phone: String(phone).trim(),
      eventType: String(eventType).trim(),
      eventDate: eventDate || null,
      location: location || "",
      guestCount: Number(guestCount || 0),
      budget: Number(budget || 0),
      message: message || "",
      status: "pending",
    });

    const populatedInquiry =
      await Inquiry.findById(inquiry._id)
        .populate(
          "mandali",
          "name phone city state role"
        )
        .populate(
          "customer",
          "phone role"
        );

    return res.status(201).json({
      success: true,
      message: "Inquiry created successfully",
      inquiry: populatedInquiry,
    });
  } catch (error) {
    console.error(
      "Create Inquiry Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create inquiry",
    });
  }
};

// =====================================
// GET MANDALI INQUIRIES
// =====================================
exports.getInquiries = async (req, res) => {
  try {
    const mandali = await getMandali(req.user.id);

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Mandali profile not found",
      });
    }

    const filter = {
      mandali: mandali._id,
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const inquiries = await Inquiry.find(filter)
      .populate(
        "customer",
        "phone role status"
      )
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (error) {
    console.error(
      "Get Inquiries Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch inquiries",
    });
  }
};

// =====================================
// GET CUSTOMER INQUIRIES
// =====================================
exports.getMyInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find({
      customer: req.user.id,
    })
      .populate(
        "mandali",
        "name phone city state role"
      )
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (error) {
    console.error(
      "Get My Inquiries Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch inquiries",
    });
  }
};

// =====================================
// GET SINGLE INQUIRY
// =====================================
exports.getInquiry = async (req, res) => {
  try {
    const { id } = req.params;

    const inquiry = await Inquiry.findById(id)
      .populate(
        "mandali",
        "name phone city state role"
      )
      .populate(
        "customer",
        "phone role status"
      );

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    const mandali = await getMandali(req.user.id);

    const isMandali =
      mandali &&
      String(mandali._id) ===
        String(inquiry.mandali._id);

    const isCustomer =
      String(inquiry.customer._id) ===
      String(req.user.id);

    if (!isMandali && !isCustomer) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to view this inquiry",
      });
    }

    return res.json({
      success: true,
      inquiry,
    });
  } catch (error) {
    console.error(
      "Get Inquiry Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch inquiry",
    });
  }
};

// =====================================
// RESPOND TO INQUIRY
// =====================================
exports.respondToInquiry = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      status,
      responseMessage,
      quotedAmount,
    } = req.body;

    const mandali = await getMandali(req.user.id);

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Mandali profile not found",
      });
    }

    if (mandali.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Mandali is not approved",
      });
    }

    const inquiry = await Inquiry.findOne({
      _id: id,
      mandali: mandali._id,
    });

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    if (
      !["pending", "responded"].includes(
        inquiry.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This inquiry can no longer be responded to",
      });
    }

    if (
      status &&
      !["responded", "rejected"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid inquiry status",
      });
    }

    if (responseMessage !== undefined) {
      inquiry.responseMessage =
        String(responseMessage).trim();
    }

    if (quotedAmount !== undefined) {
      const amount = Number(quotedAmount);

      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid quoted amount",
        });
      }

      inquiry.quotedAmount = amount;
    }

    inquiry.status = status || "responded";
    inquiry.respondedAt = new Date();

    await inquiry.save();

    return res.json({
      success: true,
      message: "Inquiry response saved successfully",
      inquiry,
    });
  } catch (error) {
    console.error(
      "Respond Inquiry Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to respond to inquiry",
    });
  }
};

// =====================================
// CUSTOMER CANCEL INQUIRY
// =====================================
exports.cancelInquiry = async (req, res) => {
  try {
    const { id } = req.params;

    const inquiry = await Inquiry.findOne({
      _id: id,
      customer: req.user.id,
    });

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    if (
      ["completed", "cancelled"].includes(
        inquiry.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This inquiry cannot be cancelled",
      });
    }

    inquiry.status = "cancelled";

    await inquiry.save();

    return res.json({
      success: true,
      message: "Inquiry cancelled successfully",
      inquiry,
    });
  } catch (error) {
    console.error(
      "Cancel Inquiry Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to cancel inquiry",
    });
  }
};

// =====================================
// CUSTOMER ACCEPTS MANDALI QUOTE -> BOOKING
// =====================================
exports.acceptQuote = async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({
      _id: req.params.id,
      customer: req.user._id,
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

    const mandali = await Vendor.findOne({ _id: inquiry.mandali, role: "mandali", status: "approved" });
    if (!mandali) {
      return res.status(404).json({ success: false, message: "Mandali is no longer available" });
    }

    // Atomic claim so a double tap can not create two bookings
    const claimed = await Inquiry.findOneAndUpdate(
      { _id: inquiry._id, status: "responded" },
      { $set: { status: "accepted" } },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ success: false, message: "Quote already accepted" });
    }

    const amount = round(claimed.quotedAmount);
    const pct =
      mandali.commissionPercentage !== null && mandali.commissionPercentage !== undefined
        ? mandali.commissionPercentage
        : config().commissionPercent;
    const commissionAmount = round((amount * pct) / 100);
    const advancePercent = Number(claimed.advancePercent || process.env.MANDALI_ADVANCE_PERCENT || 25);

    const eventDate = claimed.eventDate ? new Date(claimed.eventDate).toISOString().slice(0, 10) : "";

    let booking;
    try {
      booking = await Booking.create({
        customer: claimed.customer,
        vendor: mandali._id,
        serviceType: "mandali",
        title: `${claimed.eventType} - Mandali booking`,
        description: claimed.message || "",
        scheduledDate: eventDate,
        address: claimed.location || "",
        amount,
        baseAmount: amount,
        totalAmount: amount,
        commissionPercentage: pct,
        commissionAmount,
        vendorAmount: round(amount - commissionAmount),
        paymentMethod: "razorpay",
        paymentStatus: "pending",
        status: "pending", // becomes "confirmed" when the advance is paid
        source: "app",
        metadata: {
          inquiry: String(claimed._id),
          guestCount: claimed.guestCount,
          advancePercent,
        },
      });
    } catch (e) {
      await Inquiry.updateOne({ _id: claimed._id }, { $set: { status: "responded" } });
      throw e;
    }

    claimed.booking = booking._id;
    await claimed.save();

    try {
      await notifyUser({
        userId: mandali.user,
        title: "Quote accepted",
        message: `${claimed.name} accepted your quote of ₹${amount}. Advance payment pending.`,
        type: "booking_created",
        referenceId: booking._id,
        referenceType: "booking",
      });
    } catch (_) {}

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
    console.error("Accept Quote Error:", error);
    return res.status(500).json({ success: false, message: "Failed to accept quote" });
  }
};
