const mongoose = require("mongoose");

const User = require("../models/User");
const Vendor = require("../models/Vendor");
const Booking = require("../models/Booking");
const Consultation = require("../models/Consultation");
const Review = require("../models/Review");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const Earning = require("../models/Earning");
const Notification = require("../models/Notification");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/*
==================================================
ADMIN DASHBOARD
==================================================
*/
exports.getDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      totalVendors,
      totalAstrologers,
      totalPandits,
      totalMerchants,
      totalMandalis,
      pendingVendors,
      approvedVendors,
      onlineVendors,
      totalBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      totalConsultations,
      activeConsultations,
      completedConsultations,
      totalReviews,
      pendingReviews,
      totalWallets,
      totalTransactions,
      totalEarnings,
    ] = await Promise.all([
      User.countDocuments(),

      User.countDocuments({
        role: "customer",
      }),

      Vendor.countDocuments(),

      Vendor.countDocuments({
        role: "astrologer",
      }),

      Vendor.countDocuments({
        role: "pandit",
      }),

      Vendor.countDocuments({
        role: "merchant",
      }),

      Vendor.countDocuments({
        role: "mandali",
      }),

      Vendor.countDocuments({
        status: "pending",
      }),

      Vendor.countDocuments({
        status: "approved",
      }),

      Vendor.countDocuments({
        isOnline: true,
        status: "approved",
      }),

      Booking.countDocuments(),

      Booking.countDocuments({
        status: "pending",
      }),

      Booking.countDocuments({
        status: "completed",
      }),

      Booking.countDocuments({
        status: "cancelled",
      }),

      Consultation.countDocuments(),

      Consultation.countDocuments({
        status: {
          $in: [
            "requested",
            "accepted",
            "waiting",
            "active",
          ],
        },
      }),

      Consultation.countDocuments({
        status: "completed",
      }),

      Review.countDocuments(),

      Review.countDocuments({
        status: "pending",
      }),

      Wallet.countDocuments(),

      WalletTransaction.countDocuments(),

      Earning.countDocuments(),
    ]);

    const bookingRevenue = await Booking.aggregate([
      {
        $match: {
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$total",
          },
        },
      },
    ]);

    const consultationRevenue =
      await Consultation.aggregate([
        {
          $match: {
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: "$customerAmount",
            },
          },
        },
      ]);

    const totalBookingRevenue =
      bookingRevenue[0]?.total || 0;

    const totalConsultationRevenue =
      consultationRevenue[0]?.total || 0;

    return res.json({
      success: true,

      dashboard: {
        users: {
          total: totalUsers,
          customers: totalCustomers,
        },

        vendors: {
          total: totalVendors,
          astrologers: totalAstrologers,
          pandits: totalPandits,
          merchants: totalMerchants,
          mandalis: totalMandalis,
          pending: pendingVendors,
          approved: approvedVendors,
          online: onlineVendors,
        },

        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
          revenue: totalBookingRevenue,
        },

        consultations: {
          total: totalConsultations,
          active: activeConsultations,
          completed: completedConsultations,
          revenue: totalConsultationRevenue,
        },

        reviews: {
          total: totalReviews,
          pending: pendingReviews,
        },

        wallet: {
          totalWallets,
          totalTransactions,
        },

        earnings: {
          total: totalEarnings,
        },
      },
    });
  } catch (error) {
    console.error("getDashboard:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load admin dashboard",
      error: error.message,
    });
  }
};


/*
==================================================
GET USERS
==================================================
*/
exports.getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      status,
      search,
    } = req.query;

    const filter = {};

    if (role) {
      filter.role = role;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          email: {
            $regex: search,
            $options: "i",
          },
        },
        {
          phone: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const skip =
      (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -otp")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),

      User.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(
        total / Number(limit)
      ),
      users,
    });
  } catch (error) {
    console.error("getUsers:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};


/*
==================================================
GET SINGLE USER
==================================================
*/
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(id)
      .select("-password -otp");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const vendor = await Vendor.findOne({
      user: user._id,
    });

    const wallet = await Wallet.findOne({
      user: user._id,
    });

    return res.json({
      success: true,
      user,
      vendor: vendor || null,
      wallet: wallet || null,
    });
  } catch (error) {
    console.error("getUser:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};


/*
==================================================
UPDATE USER STATUS
==================================================
*/
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "suspended",
      "inactive",
      "active",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user status",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.status = status;

    await user.save();

    return res.json({
      success: true,
      message: "User status updated successfully",
      user,
    });
  } catch (error) {
    console.error("updateUserStatus:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: error.message,
    });
  }
};


/*
==================================================
DELETE USER
==================================================
*/
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (String(id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "Admin cannot delete own account",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await Vendor.deleteOne({
      user: user._id,
    });

    await Wallet.deleteOne({
      user: user._id,
    });

    await User.deleteOne({
      _id: user._id,
    });

    return res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("deleteUser:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
    });
  }
};


/*
==================================================
GET VENDORS
==================================================
*/
exports.getVendors = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      status,
      online,
      search,
    } = req.query;

    const filter = {};

    if (role) {
      filter.role = role;
    }

    if (status) {
      filter.status = status;
    }

    if (online !== undefined) {
      filter.isOnline =
        online === "true";
    }

    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          email: {
            $regex: search,
            $options: "i",
          },
        },
        {
          phone: {
            $regex: search,
            $options: "i",
          },
        },
        {
          city: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const skip =
      (Number(page) - 1) * Number(limit);

    const [vendors, total] = await Promise.all([
      Vendor.find(filter)
        .populate(
          "user",
          "name email phone role status"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),

      Vendor.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(
        total / Number(limit)
      ),
      vendors,
    });
  } catch (error) {
    console.error("getVendors:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
    });
  }
};


/*
==================================================
GET SINGLE VENDOR
==================================================
*/
exports.getVendor = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findById(id)
      .populate(
        "user",
        "name email phone role status createdAt"
      );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    return res.json({
      success: true,
      vendor,
    });
  } catch (error) {
    console.error("getVendor:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor",
    });
  }
};


/*
==================================================
UPDATE VENDOR STATUS
==================================================
*/
exports.updateVendorStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "suspended",
      "resubmit",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor status",
      });
    }

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    vendor.status = status;

    if (status !== "approved") {
      vendor.isOnline = false;
    }

    if (
      reason !== undefined &&
      "adminNote" in vendor
    ) {
      vendor.adminNote = reason;
    }

    await vendor.save();

    if (vendor.user) {
      await User.findByIdAndUpdate(
        vendor.user,
        {
          status:
            status === "approved"
              ? "approved"
              : status === "suspended"
              ? "suspended"
              : "pending",
        }
      );
    }

    return res.json({
      success: true,
      message: "Vendor status updated successfully",
      vendor,
    });
  } catch (error) {
    console.error(
      "updateVendorStatus:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update vendor status",
      error: error.message,
    });
  }
};


/*
==================================================
FORCE VENDOR ONLINE/OFFLINE
==================================================
*/
exports.updateVendorOnlineStatus =
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isOnline } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendor ID",
        });
      }

      if (typeof isOnline !== "boolean") {
        return res.status(400).json({
          success: false,
          message:
            "isOnline must be true or false",
        });
      }

      const vendor = await Vendor.findById(id);

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      if (
        isOnline &&
        vendor.status !== "approved"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only approved vendors can be online",
        });
      }

      vendor.isOnline = isOnline;

      await vendor.save();

      return res.json({
        success: true,
        message:
          "Vendor online status updated",
        isOnline: vendor.isOnline,
      });
    } catch (error) {
      console.error(
        "updateVendorOnlineStatus:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update vendor online status",
      });
    }
  };


/*
==================================================
BOOKING MANAGEMENT
==================================================
*/
exports.getBookings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      serviceType,
      search,
    } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (serviceType) {
      filter.serviceType = serviceType;
    }

    if (search) {
      filter.bookingNumber = {
        $regex: search,
        $options: "i",
      };
    }

    const skip =
      (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate(
          "customer",
          "name email phone"
        )
        .populate(
          "vendor",
          "name email phone role"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),

      Booking.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(
        total / Number(limit)
      ),
      bookings,
    });
  } catch (error) {
    console.error("getBookings:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
};


/*
==================================================
CONSULTATION MANAGEMENT
==================================================
*/
exports.getConsultations = async (
  req,
  res
) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      serviceType,
    } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (serviceType) {
      filter.serviceType = serviceType;
    }

    const skip =
      (Number(page) - 1) * Number(limit);

    const [consultations, total] =
      await Promise.all([
        Consultation.find(filter)
          .populate(
            "customer",
            "name email phone"
          )
          .populate(
            "vendor",
            "name email phone role"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),

        Consultation.countDocuments(filter),
      ]);

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(
        total / Number(limit)
      ),
      consultations,
    });
  } catch (error) {
    console.error(
      "getConsultations:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch consultations",
    });
  }
};


/*
==================================================
WALLET OVERVIEW
==================================================
*/
exports.getWalletOverview = async (
  req,
  res
) => {
  try {
    const balance = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: {
            $sum: "$balance",
          },
          totalLockedBalance: {
            $sum: "$lockedBalance",
          },
          totalCredited: {
            $sum: "$totalCredited",
          },
          totalDebited: {
            $sum: "$totalDebited",
          },
          totalRefunded: {
            $sum: "$totalRefunded",
          },
        },
      },
    ]);

    const transactionStats =
      await WalletTransaction.aggregate([
        {
          $group: {
            _id: "$type",
            count: {
              $sum: 1,
            },
            amount: {
              $sum: "$amount",
            },
          },
        },
      ]);

    return res.json({
      success: true,
      wallet: balance[0] || {
        totalBalance: 0,
        totalLockedBalance: 0,
        totalCredited: 0,
        totalDebited: 0,
        totalRefunded: 0,
      },
      transactions: transactionStats,
    });
  } catch (error) {
    console.error(
      "getWalletOverview:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch wallet overview",
    });
  }
};


/*
==================================================
EARNINGS OVERVIEW
==================================================
*/
exports.getEarningsOverview =
  async (req, res) => {
    try {
      const stats = await Earning.aggregate([
        {
          $group: {
            _id: null,

            gross: {
              $sum: "$gross",
            },

            commission: {
              $sum: "$commission",
            },

            vendorAmount: {
              $sum: "$net",
            },

            count: {
              $sum: 1,
            },
          },
        },
      ]);

      const byService =
        await Earning.aggregate([
          {
            $group: {
              _id: "$serviceType",

              count: {
                $sum: 1,
              },

              gross: {
                $sum: "$gross",
              },

              commission: {
                $sum: "$commission",
              },

              net: {
                $sum: "$net",
              },
            },
          },

          {
            $sort: {
              gross: -1,
            },
          },
        ]);

      return res.json({
        success: true,
        summary: stats[0] || {
          gross: 0,
          commission: 0,
          vendorAmount: 0,
          count: 0,
        },
        byService,
      });
    } catch (error) {
      console.error(
        "getEarningsOverview:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch earnings overview",
      });
    }
  };


/*
==================================================
SEND ADMIN NOTIFICATION
==================================================
*/
exports.sendNotification = async (
  req,
  res
) => {
  try {
    const {
      userId,
      title,
      message,
      type = "system",
      priority = "normal",
      data = {},
    } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({
        success: false,
        message:
          "userId, title and message are required",
      });
    }

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const notification =
      await Notification.create({
        user: user._id,
        sender: req.user.id,
        type,
        title,
        message,
        priority,
        data,
        isDelivered: true,
        deliveredAt: new Date(),
      });

    return res.json({
      success: true,
      message: "Notification sent successfully",
      notification,
    });
  } catch (error) {
    console.error(
      "sendNotification:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to send notification",
      error: error.message,
    });
  }
};


/*
==================================================
SYSTEM REPORTS
==================================================
*/
exports.getReports = async (
  req,
  res
) => {
  try {
    const [
      usersByRole,
      vendorsByRole,
      bookingsByStatus,
      consultationsByStatus,
      reviewsByStatus,
      earningsByStatus,
    ] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: "$role",
            count: {
              $sum: 1,
            },
          },
        },
      ]),

      Vendor.aggregate([
        {
          $group: {
            _id: "$role",
            count: {
              $sum: 1,
            },
          },
        },
      ]),

      Booking.aggregate([
        {
          $group: {
            _id: "$status",
            count: {
              $sum: 1,
            },
            total: {
              $sum: "$total",
            },
          },
        },
      ]),

      Consultation.aggregate([
        {
          $group: {
            _id: "$status",
            count: {
              $sum: 1,
            },
            customerAmount: {
              $sum: "$customerAmount",
            },
            vendorAmount: {
              $sum: "$vendorAmount",
            },
          },
        },
      ]),

      Review.aggregate([
        {
          $group: {
            _id: "$status",
            count: {
              $sum: 1,
            },
            averageRating: {
              $avg: "$rating",
            },
          },
        },
      ]),

      Earning.aggregate([
        {
          $group: {
            _id: "$status",
            count: {
              $sum: 1,
            },
            gross: {
              $sum: "$gross",
            },
            commission: {
              $sum: "$commission",
            },
            net: {
              $sum: "$net",
            },
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      reports: {
        usersByRole,
        vendorsByRole,
        bookingsByStatus,
        consultationsByStatus,
        reviewsByStatus,
        earningsByStatus,
      },
    });
  } catch (error) {
    console.error("getReports:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate reports",
      error: error.message,
    });
  }
};


/*
==================================================
RECENT ACTIVITY
==================================================
*/
exports.getRecentActivity =
  async (req, res) => {
    try {
      const limit = Math.min(
        Number(req.query.limit) || 20,
        100
      );

      const [
        users,
        bookings,
        consultations,
        reviews,
        transactions,
      ] = await Promise.all([
        User.find()
          .select(
            "name email phone role status createdAt"
          )
          .sort({ createdAt: -1 })
          .limit(limit),

        Booking.find()
          .select(
            "bookingNumber customer vendor status serviceType total createdAt"
          )
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "vendor",
            "name phone role"
          )
          .sort({ createdAt: -1 })
          .limit(limit),

        Consultation.find()
          .select(
            "consultationNumber customer vendor status serviceType customerAmount createdAt"
          )
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "vendor",
            "name phone role"
          )
          .sort({ createdAt: -1 })
          .limit(limit),

        Review.find()
          .select(
            "customer vendor rating status title createdAt"
          )
          .populate(
            "customer",
            "name"
          )
          .populate(
            "vendor",
            "name role"
          )
          .sort({ createdAt: -1 })
          .limit(limit),

        WalletTransaction.find()
          .select(
            "user type category amount status createdAt"
          )
          .populate(
            "user",
            "name phone role"
          )
          .sort({ createdAt: -1 })
          .limit(limit),
      ]);

      return res.json({
        success: true,
        activity: {
          users,
          bookings,
          consultations,
          reviews,
          transactions,
        },
      });
    } catch (error) {
      console.error(
        "getRecentActivity:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch recent activity",
      });
    }
  };
  // ==================================================
// INSTANT PUJA DISPATCH ADMIN SETTINGS
// ==================================================

exports.getInstantDispatchSettings = async (req, res) => {
  try {
    const InstantDispatchSettings = require(
      "../models/InstantDispatchSettings"
    );

    let settings = await InstantDispatchSettings.findOne({
      key: "global",
    }).lean();

    if (!settings) {
      settings = await InstantDispatchSettings.create({
        key: "global",
      });
    }

    return res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error(
      "Get instant dispatch settings failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch instant dispatch settings",
    });
  }
};

exports.updateInstantDispatchSettings = async (req, res) => {
  try {
    const InstantDispatchSettings = require(
      "../models/InstantDispatchSettings"
    );

    const allowedFields = [
      "offerTimeoutSeconds",
      "searchTimeoutSeconds",
      "defaultRadiusKm",
      "premiumFirst",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one dispatch setting",
      });
    }

    const numericFields = [
      "offerTimeoutSeconds",
      "searchTimeoutSeconds",
      "defaultRadiusKm",
    ];

    for (const field of numericFields) {
      if (update[field] === undefined) continue;

      update[field] = Number(update[field]);

      if (!Number.isFinite(update[field])) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a number`,
        });
      }
    }

    if (
      update.premiumFirst !== undefined &&
      typeof update.premiumFirst !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "premiumFirst must be boolean",
      });
    }

    const settings = await InstantDispatchSettings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          ...update,
          updatedBy: req.user._id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "Instant dispatch settings updated",
      settings,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Update instant dispatch settings failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update instant dispatch settings",
    });
  }
};

exports.updateInstantDispatchVendor = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const Vendor = require("../models/Vendor");

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const allowedFields = [
      "instantEligible",
      "isPremium",
      "instantPriority",
      "serviceRadiusKm",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({
        success: false,
        message:
          "Provide instantEligible, isPremium, instantPriority or serviceRadiusKm",
      });
    }

    for (const field of ["instantEligible", "isPremium"]) {
      if (
        update[field] !== undefined &&
        typeof update[field] !== "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} must be boolean`,
        });
      }
    }

    for (const field of ["instantPriority", "serviceRadiusKm"]) {
      if (update[field] === undefined) continue;

      update[field] = Number(update[field]);

      if (!Number.isFinite(update[field])) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a number`,
        });
      }
    }

    const vendor = await Vendor.findOneAndUpdate(
      {
        _id: req.params.id,
        role: "pandit",
      },
      {
        $set: update,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select(
      "name role status isOnline instantEligible isPremium instantPriority serviceRadiusKm"
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Pandit vendor not found",
      });
    }

    return res.json({
      success: true,
      message: "Pandit instant dispatch settings updated",
      vendor,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Update instant dispatch vendor failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update Pandit dispatch settings",
    });
  }
};