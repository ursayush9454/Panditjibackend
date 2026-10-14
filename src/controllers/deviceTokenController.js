const DeviceToken = require("../models/DeviceToken");

const getUserId = (req) => req.user?.id || req.user?._id;

// REGISTER / UPDATE DEVICE TOKEN
exports.registerDeviceToken = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      token,
      platform = "unknown",
      deviceId = "",
      deviceName = "",
    } = req.body;

    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid device token is required",
      });
    }

    if (!["android", "ios", "web", "unknown"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid device platform",
      });
    }

    const cleanToken = token.trim();

    let device = await DeviceToken.findOne({ token: cleanToken });

    if (device) {
      device.user = userId;
      device.platform = platform;
      device.deviceId = String(deviceId || "").trim();
      device.deviceName = String(deviceName || "").trim();
      device.isActive = true;
      device.lastUsedAt = new Date();

      await device.save();
    } else {
      try {
        device = await DeviceToken.create({
          user: userId,
          token: cleanToken,
          platform,
          deviceId: String(deviceId || "").trim(),
          deviceName: String(deviceName || "").trim(),
          isActive: true,
          lastUsedAt: new Date(),
        });
      } catch (error) {
        // Handle simultaneous registration of the same token.
        if (error.code !== 11000) throw error;

        device = await DeviceToken.findOne({ token: cleanToken });

        if (!device) throw error;

        device.user = userId;
        device.platform = platform;
        device.deviceId = String(deviceId || "").trim();
        device.deviceName = String(deviceName || "").trim();
        device.isActive = true;
        device.lastUsedAt = new Date();

        await device.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Device token registered successfully",
      device: {
        id: device._id,
        platform: device.platform,
        deviceName: device.deviceName,
        isActive: device.isActive,
      },
    });
  } catch (error) {
    console.error("Register Device Token Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to register device token",
    });
  }
};

// GET MY DEVICES
exports.getMyDeviceTokens = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const devices = await DeviceToken.find({
      user: userId,
      isActive: true,
    })
      .select("-token")
      .sort({ updatedAt: -1 });

    return res.json({
      success: true,
      count: devices.length,
      devices,
    });
  } catch (error) {
    console.error("Get Device Tokens Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch device tokens",
    });
  }
};

// DEACTIVATE ONE DEVICE
exports.deactivateDeviceToken = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { token } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "Device token is required",
      });
    }

    const device = await DeviceToken.findOne({
      user: userId,
      token: token.trim(),
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device token not found",
      });
    }

    device.isActive = false;
    await device.save();

    return res.json({
      success: true,
      message: "Device token deactivated successfully",
    });
  } catch (error) {
    console.error("Deactivate Device Token Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate device token",
    });
  }
};

// LOG OUT FROM ALL REGISTERED DEVICES
exports.deactivateAllDeviceTokens = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await DeviceToken.updateMany(
      { user: userId, isActive: true },
      { $set: { isActive: false } }
    );

    return res.json({
      success: true,
      message: "All device tokens deactivated",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Deactivate All Device Tokens Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate device tokens",
    });
  }
};