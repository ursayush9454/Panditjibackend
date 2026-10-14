const Vendor = require("../models/Vendor");
const Review = require("../models/Review");
const mongoose = require("mongoose");

/*
==================================================
HELPERS
==================================================
*/

const normalizeNumber = (value, fallback) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


/*
==================================================
DISCOVER VENDORS
==================================================
GET /api/partner/discovery/vendors
==================================================
*/

exports.discoverVendors = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,

      role,
      serviceType,

      search,
      city,
      state,

      online,

      minRating,
      maxChatRate,
      maxAudioRate,
      maxVideoRate,

      sort = "recommended",
    } = req.query;

    const currentPage = Math.max(
      normalizeNumber(page, 1),
      1
    );

    const currentLimit = Math.min(
      Math.max(
        normalizeNumber(limit, 20),
        1
      ),
      50
    );

    const skip =
      (currentPage - 1) *
      currentLimit;

    const filter = {
      status: "approved",
    };

    /*
    ==========================================
    ROLE FILTER
    ==========================================
    */

    const allowedRoles = [
      "astrologer",
      "pandit",
      "merchant",
      "mandali",
    ];

    if (
      role &&
      allowedRoles.includes(role)
    ) {
      filter.role = role;
    }

    /*
    ==========================================
    CITY / STATE
    ==========================================
    */

    if (city) {
      filter.city = {
        $regex: city,
        $options: "i",
      };
    }

    if (state) {
      filter.state = {
        $regex: state,
        $options: "i",
      };
    }

    /*
    ==========================================
    ONLINE FILTER
    ==========================================
    */

    if (online !== undefined) {
      filter.isOnline =
        online === "true";
    }

    /*
    ==========================================
    SEARCH
    ==========================================
    */

    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          bio: {
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
        {
          state: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    /*
    ==========================================
    SERVICE TYPE
    ==========================================
    */

    if (serviceType === "chat") {
      filter.chatRate = {
        $exists: true,
        $gt: 0,
      };
    }

    if (serviceType === "audio") {
      filter.audioRate = {
        $exists: true,
        $gt: 0,
      };
    }

    if (serviceType === "video") {
      filter.videoRate = {
        $exists: true,
        $gt: 0,
      };
    }

    /*
    ==========================================
    RATING FILTER
    ==========================================
    */

    if (minRating) {
      const rating = Number(minRating);

      if (Number.isFinite(rating)) {
        filter.$or = [
          ...(filter.$or || []),
          {
            rating: {
              $gte: rating,
            },
          },
          {
            averageRating: {
              $gte: rating,
            },
          },
        ];
      }
    }

    /*
    ==========================================
    RATE FILTERS
    ==========================================
    */

    if (maxChatRate) {
      filter.chatRate = {
        ...(filter.chatRate || {}),
        $lte: Number(maxChatRate),
      };
    }

    if (maxAudioRate) {
      filter.audioRate = {
        ...(filter.audioRate || {}),
        $lte: Number(maxAudioRate),
      };
    }

    if (maxVideoRate) {
      filter.videoRate = {
        ...(filter.videoRate || {}),
        $lte: Number(maxVideoRate),
      };
    }

    /*
    ==========================================
    SORT
    ==========================================
    */

    let sortQuery = {
      isOnline: -1,
      rating: -1,
      totalReviews: -1,
      createdAt: -1,
    };

    switch (sort) {
      case "rating_high":
        sortQuery = {
          rating: -1,
          averageRating: -1,
          totalReviews: -1,
        };
        break;

      case "rating_low":
        sortQuery = {
          rating: 1,
          averageRating: 1,
        };
        break;

      case "price_low":
        sortQuery = {
          chatRate: 1,
          audioRate: 1,
          videoRate: 1,
        };
        break;

      case "price_high":
        sortQuery = {
          chatRate: -1,
          audioRate: -1,
          videoRate: -1,
        };
        break;

      case "newest":
        sortQuery = {
          createdAt: -1,
        };
        break;

      case "online":
        sortQuery = {
          isOnline: -1,
          rating: -1,
        };
        break;

      case "recommended":
      default:
        sortQuery = {
          isOnline: -1,
          rating: -1,
          totalReviews: -1,
          createdAt: -1,
        };
        break;
    }

    /*
    ==========================================
    QUERY
    ==========================================
    */

    const [vendors, total] =
      await Promise.all([
        Vendor.find(filter)
          .select(
            "-bankDetails -documents -adminNote -commissionPercentage"
          )
          .sort(sortQuery)
          .skip(skip)
          .limit(currentLimit)
          .lean(),

        Vendor.countDocuments(filter),
      ]);

    return res.json({
      success: true,

      filters: {
        role: role || null,
        serviceType: serviceType || null,
        search: search || null,
        city: city || null,
        state: state || null,
        online:
          online !== undefined
            ? online === "true"
            : null,
        minRating:
          minRating
            ? Number(minRating)
            : null,
        sort,
      },

      page: currentPage,
      limit: currentLimit,

      total,

      totalPages: Math.ceil(
        total / currentLimit
      ),

      hasNextPage:
        currentPage <
        Math.ceil(
          total / currentLimit
        ),

      vendors,
    });
  } catch (error) {
    console.error(
      "discoverVendors:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to discover vendors",
      error: error.message,
    });
  }
};


/*
==================================================
GET VENDOR DETAILS
==================================================
GET /api/partner/discovery/vendors/:id
==================================================
*/

exports.getVendorDetails = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findOne({
      _id: id,
      status: "approved",
    })
      .select(
        "-bankDetails -documents -adminNote -commissionPercentage"
      )
      .populate(
        "user",
        "name email phone role"
      );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const reviewStats =
      await Review.aggregate([
        {
          $match: {
            vendor: vendor._id,
            status: "published",
          },
        },
        {
          $group: {
            _id: "$rating",

            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            _id: -1,
          },
        },
      ]);

    const totalReviews =
      reviewStats.reduce(
        (sum, item) =>
          sum + item.count,
        0
      );

    const ratingTotal =
      reviewStats.reduce(
        (sum, item) =>
          sum +
          item._id *
            item.count,
        0
      );

    const averageRating =
      totalReviews > 0
        ? Number(
            (
              ratingTotal /
              totalReviews
            ).toFixed(2)
          )
        : 0;

    return res.json({
      success: true,

      vendor: {
        ...vendor.toObject(),

        calculatedRating:
          averageRating,

        calculatedTotalReviews:
          totalReviews,

        ratingBreakdown:
          reviewStats,
      },
    });
  } catch (error) {
    console.error(
      "getVendorDetails:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch vendor details",
      error: error.message,
    });
  }
};


/*
==================================================
GET TOP ASTROLOGERS
==================================================
*/

exports.getTopAstrologers = async (
  req,
  res
) => {
  try {
    const limit = Math.min(
      Math.max(
        normalizeNumber(
          req.query.limit,
          10
        ),
        1
      ),
      30
    );

    const astrologers =
      await Vendor.find({
        role: "astrologer",
        status: "approved",
      })
        .select(
          "-bankDetails -documents -adminNote -commissionPercentage"
        )
        .sort({
          isOnline: -1,
          rating: -1,
          totalReviews: -1,
        })
        .limit(limit)
        .lean();

    return res.json({
      success: true,
      count: astrologers.length,
      astrologers,
    });
  } catch (error) {
    console.error(
      "getTopAstrologers:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch top astrologers",
    });
  }
};


/*
==================================================
GET ONLINE ASTROLOGERS
==================================================
*/

exports.getOnlineAstrologers =
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          normalizeNumber(
            req.query.limit,
            20
          ),
          1
        ),
        50
      );

      const astrologers =
        await Vendor.find({
          role: "astrologer",
          status: "approved",
          isOnline: true,
        })
          .select(
            "-bankDetails -documents -adminNote -commissionPercentage"
          )
          .sort({
            rating: -1,
            totalReviews: -1,
          })
          .limit(limit)
          .lean();

      return res.json({
        success: true,
        count: astrologers.length,
        astrologers,
      });
    } catch (error) {
      console.error(
        "getOnlineAstrologers:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch online astrologers",
      });
    }
  };


/*
==================================================
GET VENDORS BY ROLE
==================================================
*/

exports.getVendorsByRole = async (
  req,
  res
) => {
  try {
    const { role } = req.params;

    const allowedRoles = [
      "astrologer",
      "pandit",
      "merchant",
      "mandali",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor role",
      });
    }

    const limit = Math.min(
      Math.max(
        normalizeNumber(
          req.query.limit,
          20
        ),
        1
      ),
      50
    );

    const vendors =
      await Vendor.find({
        role,
        status: "approved",
      })
        .select(
          "-bankDetails -documents -adminNote -commissionPercentage"
        )
        .sort({
          isOnline: -1,
          rating: -1,
          createdAt: -1,
        })
        .limit(limit)
        .lean();

    return res.json({
      success: true,
      role,
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    console.error(
      "getVendorsByRole:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch vendors",
    });
  }
};


/*
==================================================
DISCOVERY STATS
==================================================
*/

exports.getDiscoveryStats =
  async (req, res) => {
    try {
      const stats =
        await Vendor.aggregate([
          {
            $match: {
              status: "approved",
            },
          },

          {
            $group: {
              _id: "$role",

              total: {
                $sum: 1,
              },

              online: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        "$isOnline",
                        true,
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageRating: {
                $avg: "$rating",
              },
            },
          },

          {
            $sort: {
              total: -1,
            },
          },
        ]);

      return res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error(
        "getDiscoveryStats:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch discovery stats",
      });
    }
  };