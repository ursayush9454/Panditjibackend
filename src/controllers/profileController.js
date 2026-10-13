const User = require("../models/User");
const Vendor = require("../models/Vendor");

const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(String(id));
};

/*
========================================
GET MY PROFILE
========================================
*/
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const vendor = await Vendor.findOne({
      user: user._id,
    });

    let profileCompletion = 0;

    const userFields = [
      user.name,
      user.email,
      user.phone,
    ];

    const userCompleted = userFields.filter(Boolean).length;

    profileCompletion += Math.round(
      (userCompleted / userFields.length) * 50
    );

    if (vendor) {
      const vendorFields = [
        vendor.name,
        vendor.email,
        vendor.city,
        vendor.state,
        vendor.bio,
        vendor.experience,
        vendor.profileImage,
      ];

      const vendorCompleted =
        vendorFields.filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            value !== ""
        ).length;

      profileCompletion += Math.round(
        (vendorCompleted / vendorFields.length) * 50
      );
    }

    return res.json({
      success: true,
      profileCompletion,
      user,
      vendor: vendor || null,
    });
  } catch (error) {
    console.error("getMyProfile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

/*
========================================
UPDATE CUSTOMER PROFILE
========================================
*/
exports.updateMyProfile = async (req, res) => {
  try {
    const {
      name,
      email,
      gender,
      city,
      state,
      address,
      profileImage,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (name !== undefined) {
      user.name = name;
    }

    if (email !== undefined) {
      user.email = email;
    }

    if (gender !== undefined) {
      user.gender = gender;
    }

    if (city !== undefined) {
      user.city = city;
    }

    if (state !== undefined) {
      user.state = state;
    }

    if (address !== undefined) {
      user.address = address;
    }

    if (profileImage !== undefined) {
      user.profileImage = profileImage;
    }

    await user.save();

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: await User.findById(user._id).select(
        "-password -otp"
      ),
    });
  } catch (error) {
    console.error("updateMyProfile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

/*
========================================
UPDATE VENDOR PROFILE
========================================
*/
exports.updateVendorProfile = async (req, res) => {
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

    const {
      name,
      email,
      gender,
      city,
      state,
      address,
      profileImage,
      bio,
      experience,
      chatRate,
      audioRate,
      videoRate,
    } = req.body;

    if (name !== undefined) vendor.name = name;
    if (email !== undefined) vendor.email = email;
    if (gender !== undefined) vendor.gender = gender;
    if (city !== undefined) vendor.city = city;
    if (state !== undefined) vendor.state = state;
    if (address !== undefined) vendor.address = address;
    if (profileImage !== undefined) {
      vendor.profileImage = profileImage;
    }

    if (bio !== undefined) {
      vendor.bio = bio;
    }

    if (experience !== undefined) {
      vendor.experience = Number(experience);
    }

    if (chatRate !== undefined) {
      vendor.chatRate = Number(chatRate);
    }

    if (audioRate !== undefined) {
      vendor.audioRate = Number(audioRate);
    }

    if (videoRate !== undefined) {
      vendor.videoRate = Number(videoRate);
    }

    await vendor.save();

    return res.json({
      success: true,
      message: "Vendor profile updated successfully",
      vendor,
    });
  } catch (error) {
    console.error("updateVendorProfile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update vendor profile",
      error: error.message,
    });
  }
};

/*
========================================
UPDATE ONLINE STATUS
========================================
*/
exports.updateOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isOnline must be true or false",
      });
    }

    const vendor = await Vendor.findOne({
      user: req.user.id,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Vendor is not approved",
      });
    }

    vendor.isOnline = isOnline;

    await vendor.save();

    return res.json({
      success: true,
      message: isOnline
        ? "You are now online"
        : "You are now offline",
      isOnline: vendor.isOnline,
    });
  } catch (error) {
    console.error("updateOnlineStatus:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update online status",
    });
  }
};

/*
========================================
PUBLIC VENDOR PROFILE
========================================
*/
exports.getPublicVendorProfile = async (req, res) => {
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
    }).select(
      "-bankDetails -documents -adminNote"
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
    console.error("getPublicVendorProfile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor profile",
    });
  }
};

/*
========================================
CHANGE EMAIL
========================================
*/
exports.changeEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user.id },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.email = normalizedEmail;

    await user.save();

    return res.json({
      success: true,
      message: "Email updated successfully",
      email: user.email,
    });
  } catch (error) {
    console.error("changeEmail:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change email",
    });
  }
};

/*
========================================
CHANGE PHONE
========================================
*/
exports.changePhone = async (req, res) => {
  try {
    const { phone } = req.body;

    if (String(process.env.AUTH_OTP_MODE || "").toLowerCase() === "firebase") {
      return res.status(400).json({
        success: false,
        message: "Phone numbers must be verified by OTP. Use POST /auth/phone/link.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }

    const normalizedPhone = String(phone).trim();

    const existingUser = await User.findOne({
      phone: normalizedPhone,
      _id: { $ne: req.user.id },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Phone number already in use",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.phone = normalizedPhone;

    await user.save();

    return res.json({
      success: true,
      message: "Phone number updated successfully",
      phone: user.phone,
    });
  } catch (error) {
    console.error("changePhone:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change phone number",
    });
  }
};

/*
========================================
DEACTIVATE ACCOUNT
========================================
*/
exports.deactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.status = "inactive";

    await user.save();

    await Vendor.findOneAndUpdate(
      { user: user._id },
      {
        isOnline: false,
      }
    );

    return res.json({
      success: true,
      message: "Account deactivated successfully",
    });
  } catch (error) {
    console.error("deactivateAccount:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate account",
    });
  }
};

/*
========================================
REACTIVATE ACCOUNT
========================================
*/
exports.reactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.status = "approved";

    await user.save();

    return res.json({
      success: true,
      message: "Account reactivated successfully",
    });
  } catch (error) {
    console.error("reactivateAccount:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reactivate account",
    });
  }
};

/*
========================================
DELETE ACCOUNT
========================================
*/
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await Vendor.deleteOne({
      user: user._id,
    });

    await User.deleteOne({
      _id: user._id,
    });

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("deleteAccount:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete account",
    });
  }
};