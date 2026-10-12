const Vendor = require("../models/Vendor");

exports.getStatus = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "astrologer",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Astrologer profile not found",
      });
    }

    return res.json({
      success: true,
      status: vendor.status,
      isOnline: vendor.isOnline,
    });
  } catch (error) {
    console.error("Astrologer Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer status",
    });
  }
};

exports.updateStatus = async (req, res) => {
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
      role: "astrologer",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Astrologer profile not found",
      });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Astrologer is not approved yet",
      });
    }

    vendor.isOnline = isOnline;

    await vendor.save();

    return res.json({
      success: true,
      message: isOnline
        ? "Astrologer is now online"
        : "Astrologer is now offline",
      isOnline: vendor.isOnline,
    });
  } catch (error) {
    console.error("Update Astrologer Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update astrologer status",
    });
  }
};

exports.getRates = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "astrologer",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Astrologer profile not found",
      });
    }

    return res.json({
      success: true,
      rates: {
        chat: vendor.chatRate || 0,
        audio: vendor.audioRate || 0,
        video: vendor.videoRate || 0,
      },
    });
  } catch (error) {
    console.error("Get Astrologer Rates Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer rates",
    });
  }
};

exports.updateRates = async (req, res) => {
  try {
    const {
      chatRate,
      audioRate,
      videoRate,
    } = req.body;

    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "astrologer",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Astrologer profile not found",
      });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Astrologer is not approved yet",
      });
    }

    if (
      chatRate === undefined &&
      audioRate === undefined &&
      videoRate === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one rate is required",
      });
    }

    if (chatRate !== undefined) {
      if (Number(chatRate) < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid chat rate",
        });
      }

      vendor.chatRate = Number(chatRate);
    }

    if (audioRate !== undefined) {
      if (Number(audioRate) < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid audio rate",
        });
      }

      vendor.audioRate = Number(audioRate);
    }

    if (videoRate !== undefined) {
      if (Number(videoRate) < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid video rate",
        });
      }

      vendor.videoRate = Number(videoRate);
    }

    await vendor.save();

    return res.json({
      success: true,
      message: "Astrologer rates updated",
      rates: {
        chat: vendor.chatRate || 0,
        audio: vendor.audioRate || 0,
        video: vendor.videoRate || 0,
      },
    });
  } catch (error) {
    console.error("Update Astrologer Rates Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update astrologer rates",
    });
  }
};