const User = require("../models/User");
const Vendor = require("../models/Vendor");

const ALLOWED_ROLES = [
  "pandit",
  "astrologer",
  "merchant",
  "mandali",
];

exports.register = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      role,
      name,
      email,
      gender,
      city,
      state,
      address,
      profileImage,
      bio,
      experience,
    } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid role. Allowed roles: pandit, astrologer, merchant, mandali",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingVendor = await Vendor.findOne({
      user: userId,
    });

    if (existingVendor) {
      return res.status(409).json({
        success: false,
        message: "Vendor profile already exists",
        vendor: existingVendor,
      });
    }

    const vendor = await Vendor.create({
      user: userId,
      role,
      name,
      email,
      phone: user.phone,
      gender,
      city,
      state,
      address,
      profileImage,
      bio,
      experience,
      status: "pending",
      isOnline: false,
    });

    user.role = role;
    user.status = "pending";

    await user.save();

    return res.status(201).json({
      success: true,
      message: "Vendor registration successful",
      vendor,
    });
  } catch (error) {
    console.error("Vendor Register Error:", error);

    return res.status(500).json({
      success: false,
      message: "Vendor registration failed",
      error: error.message,
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
    }).populate("user", "phone role status");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    return res.json({
      success: true,
      vendor,
    });
  } catch (error) {
    console.error("Get Vendor Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor profile",
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "email",
      "gender",
      "city",
      "state",
      "address",
      "profileImage",
      "bio",
      "experience",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const vendor = await Vendor.findOneAndUpdate(
      {
        user: req.user.id,
      },
      {
        $set: updates,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    return res.json({
      success: true,
      message: "Vendor profile updated",
      vendor,
    });
  } catch (error) {
    console.error("Update Vendor Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update vendor profile",
      error: error.message,
    });
  }
};

exports.getVendorStatus = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    return res.json({
      success: true,
      status: vendor.status,
      role: vendor.role,
      isOnline: vendor.isOnline,
    });
  } catch (error) {
    console.error("Vendor Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor status",
    });
  }
};
// =====================================
// PUBLIC VENDOR PROFILE
// =====================================
exports.getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findOne({
      _id: id,
      status: "approved",
    }).select(
      "-__v"
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
    console.error(
      "Get Public Vendor Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch vendor profile",
    });
  }
};