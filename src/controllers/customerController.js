const Vendor = require("../models/Vendor");

// ======================================================
// Get Approved Vendors
// ======================================================

exports.getVendors = async (req, res) => {
  try {
    const {
      role,
      city,
      search,
      online,
    } = req.query;

    const filter = {
      status: "approved",
    };

    if (
      role &&
      ["pandit", "astrologer", "merchant", "mandali"].includes(role)
    ) {
      filter.role = role;
    }

    if (city) {
      filter.city = new RegExp(city.trim(), "i");
    }

    if (online === "true") {
      filter.isOnline = true;
    }

    if (search) {
      const searchRegex = new RegExp(
        search.trim(),
        "i"
      );

      filter.$or = [
        { name: searchRegex },
        { city: searchRegex },
        { state: searchRegex },
        { bio: searchRegex },
      ];
    }

    const vendors = await Vendor.find(filter)
      .select(
        "name role email phone city state profileImage bio experience chatRate audioRate videoRate isOnline status"
      )
      .sort({
        isOnline: -1,
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    console.error("Get Vendors Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
    });
  }
};

// ======================================================
// Get Online Astrologers
// ======================================================

exports.getOnlineAstrologers = async (req, res) => {
  try {
    const astrologers = await Vendor.find({
      role: "astrologer",
      status: "approved",
      isOnline: true,
    })
      .select(
        "name role profileImage bio experience city state chatRate audioRate videoRate isOnline"
      )
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: astrologers.length,
      astrologers,
    });
  } catch (error) {
    console.error(
      "Get Online Astrologers Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch online astrologers",
    });
  }
};

// ======================================================
// Get Vendors By Role
// ======================================================

exports.getVendorsByRole = async (req, res) => {
  try {
    const { role } = req.params;

    const allowedRoles = [
      "pandit",
      "astrologer",
      "merchant",
      "mandali",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor role",
      });
    }

    const vendors = await Vendor.find({
      role,
      status: "approved",
    })
      .select(
        "name role profileImage bio experience city state chatRate audioRate videoRate isOnline"
      )
      .sort({
        isOnline: -1,
        createdAt: -1,
      });

    return res.json({
      success: true,
      role,
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    console.error(
      "Get Vendors By Role Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
    });
  }
};