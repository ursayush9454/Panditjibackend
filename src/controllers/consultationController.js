const mongoose = require("mongoose");

const Consultation = require("../models/Consultation");
const CallSession = require("../models/CallSession");
const Vendor = require("../models/Vendor");

const consultationService = require("../services/consultationService");

// =====================================================
// HELPERS
// =====================================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getUserId = (req) => {
  return req.user?.id || req.user?._id;
};

// =====================================================
// CREATE CONSULTATION
// =====================================================

exports.createConsultation = async (req, res) => {
  try {
    const customerId = getUserId(req);

    const {
      vendorId,
      serviceType,
      bookingId,
      conversationId,
      title,
      description,
      metadata,
    } = req.body;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Authorization required",
      });
    }

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendorId is required",
      });
    }

    if (!isValidObjectId(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendorId",
      });
    }

    if (
      !["chat", "audio", "video"].includes(
        serviceType
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "serviceType must be chat, audio or video",
      });
    }

    const consultation =
      await consultationService.createConsultation({
        customerId,
        vendorId,
        serviceType,
        bookingId,
        conversationId,
        title,
        description,
        metadata,
      });

    const populated =
      await Consultation.findById(
        consultation._id
      )
        .populate(
          "vendor",
          "name role email phone chatRate audioRate videoRate status isOnline"
        )
        .populate(
          "booking",
          "bookingNumber status serviceType date startTime endTime"
        )
        .populate(
          "conversation"
        );

    return res.status(201).json({
      success: true,
      message: "Consultation created",
      consultation: populated,
    });
  } catch (error) {
    console.error(
      "Create consultation error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// MY CONSULTATIONS
// =====================================================

exports.getMyConsultations = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);

    const {
      status,
      serviceType,
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(
      1,
      Number(page) || 1
    );

    const currentLimit = Math.min(
      100,
      Math.max(1, Number(limit) || 20)
    );

    const query = {
      $or: [
        { customer: userId },
        {
          vendor: {
            $in: await Vendor.find({
              user: userId,
            }).distinct("_id"),
          },
        },
      ],
    };

    if (status) {
      query.status = status;
    }

    if (serviceType) {
      query.serviceType = serviceType;
    }

    const skip =
      (currentPage - 1) *
      currentLimit;

    const [consultations, total] =
      await Promise.all([
        Consultation.find(query)
          .populate(
            "vendor",
            "name role profileImage experience chatRate audioRate videoRate status isOnline"
          )
          .populate(
            "booking",
            "bookingNumber status serviceType date startTime endTime totalAmount"
          )
          .populate(
            "conversation"
          )
          .populate(
            "earning",
            "grossAmount commissionAmount netAmount status"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(currentLimit),

        Consultation.countDocuments(query),
      ]);

    return res.json({
      success: true,
      page: currentPage,
      limit: currentLimit,
      total,
      totalPages: Math.ceil(
        total / currentLimit
      ),
      consultations,
    });
  } catch (error) {
    console.error(
      "Get consultations error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// GET CONSULTATION
// =====================================================

exports.getConsultation = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid consultation ID",
      });
    }

    const consultation =
      await Consultation.findById(id)
        .populate(
          "customer",
          "name phone role"
        )
        .populate(
          "vendor",
          "name role email phone profileImage experience chatRate audioRate videoRate status isOnline"
        )
        .populate(
          "booking"
        )
        .populate(
          "conversation"
        )
        .populate(
          "earning"
        );

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: "Consultation not found",
      });
    }

    const vendor = await Vendor.findOne({
      _id: consultation.vendor?._id,
      user: userId,
    });

    const allowed =
      String(consultation.customer?._id) ===
        String(userId) ||
      !!vendor ||
      req.user?.role === "admin";

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    return res.json({
      success: true,
      consultation,
    });
  } catch (error) {
    console.error(
      "Get consultation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// ACCEPT
// =====================================================

exports.acceptConsultation = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const consultation =
      await consultationService.acceptConsultation(
        id,
        userId
      );

    return res.json({
      success: true,
      message: "Consultation accepted",
      consultation,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// REJECT
// =====================================================

exports.rejectConsultation = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const { reason = "" } = req.body;

    const consultation =
      await consultationService.rejectConsultation(
        id,
        userId,
        reason
      );

    return res.json({
      success: true,
      message: "Consultation rejected",
      consultation,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// CREATE SESSION
// =====================================================

exports.createSession = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const session =
      await consultationService.createSession(
        id,
        userId
      );

    return res.status(201).json({
      success: true,
      message: "Session created",
      session,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// START / JOIN SESSION
// =====================================================

exports.startSession = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const result =
      await consultationService.startSession(
        id,
        userId
      );

    return res.json({
      success: true,
      message:
        "Session connection updated",
      consultation:
        result.consultation,
      session:
        result.session,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// HEARTBEAT
// =====================================================

exports.heartbeat = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const result =
      await consultationService.heartbeat(
        id,
        userId
      );

    return res.json({
      success: true,
      message: "Heartbeat updated",
      lastSeenAt:
        result.lastSeenAt,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// DISCONNECT
// =====================================================

exports.disconnect = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const result =
      await consultationService.disconnect(
        id,
        userId
      );

    return res.json({
      success: true,
      message:
        "Participant disconnected",
      consultation:
        result.consultation,
      session:
        result.session,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// END SESSION
// =====================================================

exports.endSession = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const {
      reason = "other",
    } = req.body;

    const result =
      await consultationService.endSession({
        consultationId: id,
        userId,
        reason,
      });

    return res.json({
      success: true,
      message: result.alreadyEnded
        ? "Consultation already ended"
        : "Consultation ended",
      consultation:
        result.consultation,
      session:
        result.session,
      earning:
        result.earning,
      billing:
        result.billing,
    });
  } catch (error) {
    console.error(
      "End consultation error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// GET SESSION
// =====================================================

exports.getSession = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const session =
      await consultationService.getSession(
        id,
        userId
      );

    return res.json({
      success: true,
      session,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// UPDATE NETWORK QUALITY
// =====================================================

exports.updateNetworkQuality = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const {
      quality,
    } = req.body;

    const allowedQuality = [
      "unknown",
      "excellent",
      "good",
      "fair",
      "poor",
    ];

    if (
      !allowedQuality.includes(
        quality
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid network quality",
      });
    }

    const consultation =
      await Consultation.findById(id);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message:
          "Consultation not found",
      });
    }

    const vendor =
      await Vendor.findOne({
        _id: consultation.vendor,
        user: userId,
      });

    const isVendor = !!vendor;

    const isCustomer =
      String(
        consultation.customer
      ) === String(userId);

    if (
      !isVendor &&
      !isCustomer
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const session =
      await CallSession.findOne({
        consultation:
          consultation._id,
      });

    if (!session) {
      return res.status(404).json({
        success: false,
        message:
          "Session not found",
      });
    }

    if (isCustomer) {
      session.networkQualityCustomer =
        quality;
    }

    if (isVendor) {
      session.networkQualityVendor =
        quality;
    }

    await session.save();

    return res.json({
      success: true,
      message:
        "Network quality updated",
      session,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// ADMIN - ALL CONSULTATIONS
// =====================================================

exports.getAllConsultations = async (
  req,
  res
) => {
  try {
    const {
      status,
      serviceType,
      vendorId,
      customerId,
      page = 1,
      limit = 30,
    } = req.query;

    const currentPage = Math.max(
      1,
      Number(page) || 1
    );

    const currentLimit = Math.min(
      100,
      Math.max(
        1,
        Number(limit) || 30
      )
    );

    const query = {};

    if (status) {
      query.status = status;
    }

    if (serviceType) {
      query.serviceType =
        serviceType;
    }

    if (
      vendorId &&
      isValidObjectId(vendorId)
    ) {
      query.vendor = vendorId;
    }

    if (
      customerId &&
      isValidObjectId(customerId)
    ) {
      query.customer =
        customerId;
    }

    const skip =
      (currentPage - 1) *
      currentLimit;

    const [
      consultations,
      total,
    ] = await Promise.all([
      Consultation.find(query)
        .populate(
          "customer",
          "name phone role"
        )
        .populate(
          "vendor",
          "name role email phone"
        )
        .populate(
          "booking",
          "bookingNumber status totalAmount"
        )
        .populate(
          "earning",
          "grossAmount commissionAmount netAmount status"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(
          currentLimit
        ),

      Consultation.countDocuments(
        query
      ),
    ]);

    return res.json({
      success: true,
      page: currentPage,
      limit: currentLimit,
      total,
      totalPages: Math.ceil(
        total /
          currentLimit
      ),
      consultations,
    });
  } catch (error) {
    console.error(
      "Admin consultations error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =====================================================
// ADMIN STATS
// =====================================================

exports.getConsultationStats =
  async (req, res) => {
    try {
      const [
        statusStats,
        serviceStats,
        revenueStats,
      ] = await Promise.all([
        Consultation.aggregate([
          {
            $group: {
              _id: "$status",
              count: {
                $sum: 1,
              },
            },
          },
          {
            $sort: {
              count: -1,
            },
          },
        ]),

        Consultation.aggregate([
          {
            $group: {
              _id: "$serviceType",
              count: {
                $sum: 1,
              },
              grossAmount: {
                $sum: "$grossAmount",
              },
              durationMinutes: {
                $sum: "$durationMinutes",
              },
            },
          },
        ]),

        Consultation.aggregate([
          {
            $match: {
              billingStatus:
                "finalized",
            },
          },
          {
            $group: {
              _id: null,
              totalGross: {
                $sum: "$grossAmount",
              },
              totalCommission: {
                $sum:
                  "$commissionAmount",
              },
              totalVendorAmount: {
                $sum:
                  "$vendorAmount",
              },
              totalMinutes: {
                $sum:
                  "$durationMinutes",
              },
            },
          },
        ]),
      ]);

      return res.json({
        success: true,
        stats: {
          status: statusStats,
          service: serviceStats,
          revenue:
            revenueStats[0] || {
              totalGross: 0,
              totalCommission: 0,
              totalVendorAmount: 0,
              totalMinutes: 0,
            },
        },
      });
    } catch (error) {
      console.error(
        "Consultation stats error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };