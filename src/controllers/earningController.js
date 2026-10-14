const mongoose = require("mongoose");

const Earning = require("../models/Earning");
const Vendor = require("../models/Vendor");
const {
  calculateCommission,
} = require("../services/billingService");

const getUserId = (req) =>
  req.user?.id || req.user?._id;

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const getPagination = (req) => {
  const page = Math.max(
    Number(req.query.page) || 1,
    1
  );

  const limit = Math.min(
    Math.max(Number(req.query.limit) || 20, 1),
    100
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

/*
  GET CURRENT VENDOR
*/
const getVendor = async (userId) => {
  return Vendor.findOne({
    user: userId,
  });
};

/*
  CALCULATE EARNING
*/
exports.calculate = async (req, res) => {
  try {
    const {
      serviceType = "other",
      grossAmount = 0,
    } = req.body;

    const result =
      await calculateCommission({
        serviceType,
        grossAmount,
      });

    return res.json({
      success: true,
      billing: result,
    });
  } catch (error) {
    console.error(
      "Calculate Earning Error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to calculate earning",
    });
  }
};

/*
  GET MY EARNINGS
*/
exports.getMyEarnings = async (req, res) => {
  try {
    const userId = getUserId(req);

    const vendor = await getVendor(userId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const {
      page,
      limit,
      skip,
    } = getPagination(req);

    const filter = {
      vendor: vendor._id,
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.serviceType) {
      filter.serviceType =
        req.query.serviceType;
    }

    const [earnings, total] =
      await Promise.all([
        Earning.find(filter)
          .populate("booking")
          .populate("consultation")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),

        Earning.countDocuments(filter),
      ]);

    return res.json({
      success: true,
      count: earnings.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      earnings,
    });
  } catch (error) {
    console.error(
      "Get My Earnings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch earnings",
    });
  }
};

/*
  GET EARNING DETAILS
*/
exports.getEarning = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid earning ID",
      });
    }

    const vendor = await getVendor(userId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const earning = await Earning.findOne({
      _id: id,
      vendor: vendor._id,
    })
      .populate("booking")
      .populate("consultation");

    if (!earning) {
      return res.status(404).json({
        success: false,
        message: "Earning not found",
      });
    }

    return res.json({
      success: true,
      earning,
    });
  } catch (error) {
    console.error(
      "Get Earning Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch earning",
    });
  }
};

/*
  EARNING SUMMARY
*/
exports.getSummary = async (req, res) => {
  try {
    const userId = getUserId(req);

    const vendor = await getVendor(userId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const earnings =
      await Earning.find({
        vendor: vendor._id,
      }).lean();

    let gross = 0;
    let commission = 0;
    let net = 0;
    let credited = 0;
    let pending = 0;
    let reversed = 0;

    for (const earning of earnings) {
      gross += Number(earning.grossAmount) || 0;
      commission +=
        Number(earning.commissionAmount) || 0;
      net += Number(earning.netAmount) || 0;

      if (earning.status === "credited") {
        credited +=
          Number(earning.netAmount) || 0;
      }

      if (earning.status === "pending") {
        pending +=
          Number(earning.netAmount) || 0;
      }

      if (earning.status === "reversed") {
        reversed +=
          Number(earning.netAmount) || 0;
      }
    }

    return res.json({
      success: true,
      summary: {
        totalTransactions: earnings.length,
        grossAmount: Number(gross.toFixed(2)),
        commissionAmount: Number(
          commission.toFixed(2)
        ),
        netAmount: Number(net.toFixed(2)),
        creditedAmount: Number(
          credited.toFixed(2)
        ),
        pendingAmount: Number(
          pending.toFixed(2)
        ),
        reversedAmount: Number(
          reversed.toFixed(2)
        ),
      },
    });
  } catch (error) {
    console.error(
      "Get Earning Summary Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch earning summary",
    });
  }
};

/*
  EARNING STATS
*/
exports.getStats = async (req, res) => {
  try {
    const userId = getUserId(req);

    const vendor = await getVendor(userId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const stats =
      await Earning.aggregate([
        {
          $match: {
            vendor: vendor._id,
          },
        },
        {
          $group: {
            _id: "$serviceType",
            transactions: {
              $sum: 1,
            },
            grossAmount: {
              $sum: "$grossAmount",
            },
            commissionAmount: {
              $sum: "$commissionAmount",
            },
            netAmount: {
              $sum: "$netAmount",
            },
          },
        },
        {
          $sort: {
            netAmount: -1,
          },
        },
      ]);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error(
      "Get Earning Stats Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch earning stats",
    });
  }
};