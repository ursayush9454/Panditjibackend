const mongoose = require("mongoose");

const Consultation = require("../models/Consultation");
const CallSession = require("../models/CallSession");
const Vendor = require("../models/Vendor");
const Earning = require("../models/Earning");
const Commission = require("../models/Commission");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// =====================================================
// ROUND MONEY
// =====================================================

const roundMoney = (value) => {
  return Math.round((Number(value) || 0) * 100) / 100;
};

// =====================================================
// GET VENDOR
// =====================================================

const getVendor = async (vendorId) => {
  if (!isValidObjectId(vendorId)) {
    throw new Error("Invalid vendor ID");
  }

  const vendor = await Vendor.findById(vendorId);

  if (!vendor) {
    throw new Error("Vendor not found");
  }

  if (vendor.status !== "approved") {
    throw new Error("Vendor is not approved");
  }

  return vendor;
};

// =====================================================
// GET RATE
// =====================================================

const getVendorRate = (vendor, serviceType) => {
  if (serviceType === "chat") {
    return Number(vendor.chatRate || 0);
  }

  if (serviceType === "audio") {
    return Number(vendor.audioRate || 0);
  }

  if (serviceType === "video") {
    return Number(vendor.videoRate || 0);
  }

  return 0;
};

// =====================================================
// GET COMMISSION
// =====================================================

const getCommissionPercentage = async (serviceType) => {
  let config = await Commission.findOne({
    serviceType,
    isActive: true,
  }).lean();

  if (!config) {
    config = await Commission.findOne({
      serviceType: "other",
      isActive: true,
    }).lean();
  }

  if (!config) {
    return 20;
  }

  return Number(config.percentage || 20);
};

// =====================================================
// CREATE CONSULTATION
// =====================================================

const createConsultation = async ({
  customerId,
  vendorId,
  serviceType,
  bookingId = null,
  conversationId = null,
  title = "",
  description = "",
  metadata = {},
}) => {
  if (!customerId) {
    throw new Error("Customer is required");
  }

  if (!vendorId) {
    throw new Error("Vendor is required");
  }

  if (!["chat", "audio", "video"].includes(serviceType)) {
    throw new Error("Invalid service type");
  }

  const vendor = await getVendor(vendorId);

  const rate = getVendorRate(vendor, serviceType);

  if (rate <= 0) {
    throw new Error(
      `${serviceType} consultation rate is not configured`
    );
  }

  const existing = await Consultation.findOne({
    customer: customerId,
    vendor: vendorId,
    status: {
      $in: [
        "requested",
        "accepted",
        "waiting",
        "active",
      ],
    },
  });

  if (existing) {
    throw new Error(
      "You already have an active consultation with this vendor"
    );
  }

  const consultation = await Consultation.create({
    customer: customerId,
    vendor: vendorId,
    booking: bookingId,
    conversation: conversationId,
    serviceType,
    title,
    description,
    ratePerMinute: rate,
    status: "requested",
    requestedAt: new Date(),

    // 60 seconds acceptance window
    acceptanceExpiresAt: new Date(
      Date.now() + 60 * 1000
    ),

    metadata,
  });

  return consultation;
};

// =====================================================
// ACCEPT
// =====================================================

const acceptConsultation = async (
  consultationId,
  vendorUserId
) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: vendorUserId,
  });

  if (!vendor) {
    throw new Error("You are not the assigned vendor");
  }

  if (consultation.status !== "requested") {
    throw new Error(
      `Consultation cannot be accepted from ${consultation.status} status`
    );
  }

  if (
    consultation.acceptanceExpiresAt &&
    consultation.acceptanceExpiresAt < new Date()
  ) {
    consultation.status = "timeout";
    consultation.endReason = "timeout";

    await consultation.save();

    throw new Error("Consultation request has expired");
  }

  consultation.status = "accepted";
  consultation.acceptedAt = new Date();
  consultation.waitingAt = new Date();

  await consultation.save();

  return consultation;
};

// =====================================================
// REJECT
// =====================================================

const rejectConsultation = async (
  consultationId,
  vendorUserId,
  reason = ""
) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: vendorUserId,
  });

  if (!vendor) {
    throw new Error("You are not the assigned vendor");
  }

  if (
    !["requested", "accepted", "waiting"].includes(
      consultation.status
    )
  ) {
    throw new Error(
      "Consultation cannot be rejected now"
    );
  }

  consultation.status = "rejected";
  consultation.rejectedBy = vendorUserId;
  consultation.rejectionReason = reason;

  await consultation.save();

  return consultation;
};

// =====================================================
// CREATE SESSION
// =====================================================

const createSession = async (consultationId, userId) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const isCustomer =
    String(consultation.customer) === String(userId);

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  });

  const isVendor = !!vendor;

  if (!isCustomer && !isVendor) {
    throw new Error(
      "You are not authorized for this consultation"
    );
  }

  if (
    !["accepted", "waiting"].includes(
      consultation.status
    )
  ) {
    throw new Error(
      "Consultation is not ready for session"
    );
  }

  let session = await CallSession.findOne({
    consultation: consultation._id,
  });

  if (!session) {
    session = await CallSession.create({
      consultation: consultation._id,
      booking: consultation.booking,
      customer: consultation.customer,
      vendor: consultation.vendor,
      serviceType: consultation.serviceType,
      sessionId: consultation.sessionId,
      roomId: consultation.roomId,
      provider: consultation.rtcProvider,
      status: "created",
    });
  }

  consultation.status = "waiting";
  consultation.waitingAt =
    consultation.waitingAt || new Date();

  await consultation.save();

  return session;
};

// =====================================================
// START SESSION
// =====================================================

const startSession = async (consultationId, userId) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  });

  const isVendor = !!vendor;

  const isCustomer =
    String(consultation.customer) === String(userId);

  if (!isVendor && !isCustomer) {
    throw new Error(
      "You are not authorized for this consultation"
    );
  }

  if (
    ![
      "accepted",
      "waiting",
      "active",
    ].includes(consultation.status)
  ) {
    throw new Error(
      "Consultation cannot be started now"
    );
  }

  let session = await CallSession.findOne({
    consultation: consultation._id,
  });

  if (!session) {
    session = await CallSession.create({
      consultation: consultation._id,
      booking: consultation.booking,
      customer: consultation.customer,
      vendor: consultation.vendor,
      serviceType: consultation.serviceType,
      sessionId: consultation.sessionId,
      roomId: consultation.roomId,
      provider: consultation.rtcProvider,
    });
  }

  const now = new Date();

  if (isCustomer) {
    session.customerConnected = true;
    session.customerJoinedAt =
      session.customerJoinedAt || now;
    session.customerLastSeenAt = now;

    consultation.customerConnected = true;
    consultation.customerLastSeenAt = now;
  }

  if (isVendor) {
    session.vendorConnected = true;
    session.vendorJoinedAt =
      session.vendorJoinedAt || now;
    session.vendorLastSeenAt = now;

    consultation.vendorConnected = true;
    consultation.vendorLastSeenAt = now;
  }

  if (
    session.customerConnected &&
    session.vendorConnected
  ) {
    session.status = "connected";

    if (!session.connectedAt) {
      session.connectedAt = now;
    }

    consultation.status = "active";

    if (!consultation.startedAt) {
      consultation.startedAt = now;
      consultation.billingStatus = "pending";
    }
  } else {
    session.status = "waiting";
    consultation.status = "waiting";
  }

  await session.save();
  await consultation.save();

  return {
    consultation,
    session,
  };
};

// =====================================================
// HEARTBEAT
// =====================================================

const heartbeat = async (
  consultationId,
  userId
) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  });

  const isVendor = !!vendor;

  const isCustomer =
    String(consultation.customer) === String(userId);

  if (!isVendor && !isCustomer) {
    throw new Error("Not authorized");
  }

  const now = new Date();

  const session = await CallSession.findOne({
    consultation: consultation._id,
  });

  if (isCustomer) {
    consultation.customerLastSeenAt = now;

    if (session) {
      session.customerLastSeenAt = now;
    }
  }

  if (isVendor) {
    consultation.vendorLastSeenAt = now;

    if (session) {
      session.vendorLastSeenAt = now;
    }
  }

  if (session) {
    session.lastHeartbeatAt = now;
    await session.save();
  }

  await consultation.save();

  return {
    success: true,
    lastSeenAt: now,
  };
};

// =====================================================
// DISCONNECT
// =====================================================

const disconnect = async (
  consultationId,
  userId
) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  });

  const isVendor = !!vendor;

  const isCustomer =
    String(consultation.customer) === String(userId);

  if (!isVendor && !isCustomer) {
    throw new Error("Not authorized");
  }

  const session = await CallSession.findOne({
    consultation: consultation._id,
  });

  const now = new Date();

  if (isCustomer) {
    consultation.customerConnected = false;
    consultation.customerDisconnectedAt = now;

    if (session) {
      session.customerConnected = false;
      session.customerLeftAt = now;
    }
  }

  if (isVendor) {
    consultation.vendorConnected = false;
    consultation.vendorDisconnectedAt = now;

    if (session) {
      session.vendorConnected = false;
      session.vendorLeftAt = now;
    }
  }

  if (session) {
    session.status = "reconnecting";
    await session.save();
  }

  await consultation.save();

  return {
    consultation,
    session,
  };
};

// =====================================================
// CALCULATE BILLING
// =====================================================

const calculateBilling = async (
  consultation
) => {
  if (!consultation.startedAt) {
    consultation.billingStatus = "failed";
    await consultation.save();

    throw new Error(
      "Consultation has not been started"
    );
  }

  const endedAt =
    consultation.endedAt || new Date();

  const durationMs =
    endedAt.getTime() -
    consultation.startedAt.getTime();

  const durationSeconds = Math.max(
    0,
    Math.floor(durationMs / 1000)
  );

  const durationMinutes =
    durationSeconds / 60;

  let billedMinutes = 0;

  if (durationSeconds > 0) {
    billedMinutes = Math.max(
      1,
      Math.ceil(durationMinutes)
    );
  }

  const rate = Number(
    consultation.ratePerMinute || 0
  );

  const grossAmount = roundMoney(
    billedMinutes * rate
  );

  const commissionPercentage =
    await getCommissionPercentage(
      consultation.serviceType
    );

  const commissionAmount = roundMoney(
    (grossAmount * commissionPercentage) /
      100
  );

  const vendorAmount = roundMoney(
    grossAmount - commissionAmount
  );

  consultation.durationSeconds =
    durationSeconds;

  consultation.durationMinutes =
    roundMoney(durationMinutes);

  consultation.billedMinutes =
    billedMinutes;

  consultation.grossAmount =
    grossAmount;

  consultation.customerAmount =
    grossAmount;

  consultation.commissionPercentage =
    commissionPercentage;

  consultation.commissionAmount =
    commissionAmount;

  consultation.vendorAmount =
    vendorAmount;

  consultation.platformFee =
    commissionAmount;

  consultation.billingStatus =
    "calculated";

  return {
    durationSeconds,
    durationMinutes: roundMoney(
      durationMinutes
    ),
    billedMinutes,
    ratePerMinute: rate,
    grossAmount,
    commissionPercentage,
    commissionAmount,
    vendorAmount,
    customerAmount: grossAmount,
  };
};

// =====================================================
// FINALIZE CONSULTATION
// =====================================================

const endSession = async ({
  consultationId,
  userId,
  reason = "other",
}) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  });

  const isVendor = !!vendor;

  const isCustomer =
    String(consultation.customer) === String(userId);

  // System/admin can be handled separately.
  if (!isVendor && !isCustomer) {
    throw new Error(
      "You are not authorized to end this consultation"
    );
  }

  // Idempotent response
  if (
    ["completed", "cancelled", "timeout", "no_show"].includes(
      consultation.status
    )
  ) {
    const existingSession =
      await CallSession.findOne({
        consultation: consultation._id,
      });

    return {
      consultation,
      session: existingSession,
      alreadyEnded: true,
    };
  }

  const now = new Date();

  consultation.endedAt = now;
  consultation.endReason =
    reason ||
    (isCustomer
      ? "customer_ended"
      : "vendor_ended");

  consultation.status = "completed";

  const billing = await calculateBilling(
    consultation
  );

  // ===================================================
  // CREATE EARNING
  // ===================================================

  let earning = null;

  if (billing.grossAmount > 0) {
    const transactionReference =
      `CONS-${consultation._id}-${Date.now()}`;

    earning = await Earning.create({
      vendor: consultation.vendor,
      user: consultation.vendor
        ? vendor
          ? vendor.user
          : null
        : null,

      booking: consultation.booking,
      consultation: consultation._id,

      serviceType:
        consultation.serviceType,

      durationMinutes:
        billing.durationMinutes,

      ratePerMinute:
        billing.ratePerMinute,

      grossAmount:
        billing.grossAmount,

      discountAmount:
        consultation.discountAmount || 0,

      platformFee:
        billing.commissionAmount,

      commissionPercentage:
        billing.commissionPercentage,

      commissionAmount:
        billing.commissionAmount,

      taxAmount: 0,

      netAmount:
        billing.vendorAmount,

      status: "available",

      transactionReference,

      earnedAt: now,
      creditedAt: now,

      metadata: {
        consultationNumber:
          consultation.consultationNumber,
        billedMinutes:
          billing.billedMinutes,
      },
    });

    consultation.earning = earning._id;
  }

  consultation.billingStatus =
    "finalized";

  await consultation.save();

  const session = await CallSession.findOne({
    consultation: consultation._id,
  });

  if (session) {
    session.status = "ended";
    session.endedAt = now;
    session.endedBy = userId;
    session.endReason =
      consultation.endReason;

    if (session.connectedAt) {
      const sessionDuration =
        now.getTime() -
        session.connectedAt.getTime();

      session.durationSeconds =
        Math.max(
          0,
          Math.floor(
            sessionDuration / 1000
          )
        );

      session.durationMinutes =
        roundMoney(
          session.durationSeconds / 60
        );
    }

    await session.save();
  }

  return {
    consultation,
    session,
    earning,
    billing,
    alreadyEnded: false,
  };
};

// =====================================================
// GET ACTIVE SESSION
// =====================================================

const getSession = async (
  consultationId,
  userId
) => {
  const consultation = await Consultation.findById(
    consultationId
  );

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  });

  const isVendor = !!vendor;

  const isCustomer =
    String(consultation.customer) === String(userId);

  if (!isVendor && !isCustomer) {
    throw new Error("Not authorized");
  }

  const session = await CallSession.findOne({
    consultation: consultation._id,
  });

  if (!session) {
    throw new Error("Session not created yet");
  }

  return session;
};

module.exports = {
  createConsultation,
  acceptConsultation,
  rejectConsultation,
  createSession,
  startSession,
  heartbeat,
  disconnect,
  endSession,
  getSession,
  calculateBilling,
};