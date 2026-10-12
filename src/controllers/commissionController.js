const Commission = require("../models/Commission");

const allowedServices = [
  "chat",
  "audio",
  "video",
  "pandit",
  "merchant",
  "mandali",
  "booking",
  "other",
];

/*
  GET ALL COMMISSIONS
*/
exports.getAll = async (req, res) => {
  try {
    const commissions =
      await Commission.find()
        .populate(
          "updatedBy",
          "name phone email role"
        )
        .sort({ serviceType: 1 });

    return res.json({
      success: true,
      count: commissions.length,
      commissions,
    });
  } catch (error) {
    console.error(
      "Get Commissions Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch commission settings",
    });
  }
};

/*
  GET SINGLE COMMISSION
*/
exports.getOne = async (req, res) => {
  try {
    const { serviceType } = req.params;

    if (!allowedServices.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type",
      });
    }

    const commission =
      await Commission.findOne({
        serviceType,
      });

    if (!commission) {
      return res.status(404).json({
        success: false,
        message:
          "Commission configuration not found",
      });
    }

    return res.json({
      success: true,
      commission,
    });
  } catch (error) {
    console.error(
      "Get Commission Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch commission",
    });
  }
};

/*
  CREATE / UPDATE COMMISSION
*/
exports.upsert = async (req, res) => {
  try {
    const { serviceType } = req.params;

    if (!allowedServices.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type",
      });
    }

    let {
      percentage = 20,
      fixedAmount = 0,
      vendorPercentage,
      isActive = true,
      description = "",
    } = req.body;

    percentage = Number(percentage);
    fixedAmount = Number(fixedAmount);

    if (
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Percentage must be between 0 and 100",
      });
    }

    if (
      !Number.isFinite(fixedAmount) ||
      fixedAmount < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid fixed amount",
      });
    }

    if (
      vendorPercentage === undefined ||
      vendorPercentage === null
    ) {
      vendorPercentage =
        100 - percentage;
    }

    vendorPercentage =
      Number(vendorPercentage);

    if (
      !Number.isFinite(vendorPercentage) ||
      vendorPercentage < 0 ||
      vendorPercentage > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Vendor percentage must be between 0 and 100",
      });
    }

    const commission =
      await Commission.findOneAndUpdate(
        {
          serviceType,
        },
        {
          serviceType,
          percentage,
          fixedAmount,
          vendorPercentage,
          isActive: Boolean(isActive),
          description,
          updatedBy:
            req.user?.id || req.user?._id,
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
      message:
        "Commission settings updated successfully",
      commission,
    });
  } catch (error) {
    console.error(
      "Update Commission Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update commission",
    });
  }
};

/*
  DELETE / DISABLE COMMISSION
*/
exports.disable = async (req, res) => {
  try {
    const { serviceType } = req.params;

    const commission =
      await Commission.findOneAndUpdate(
        { serviceType },
        {
          $set: {
            isActive: false,
            updatedBy:
              req.user?.id || req.user?._id,
          },
        },
        {
          new: true,
        }
      );

    if (!commission) {
      return res.status(404).json({
        success: false,
        message:
          "Commission configuration not found",
      });
    }

    return res.json({
      success: true,
      message:
        "Commission configuration disabled",
      commission,
    });
  } catch (error) {
    console.error(
      "Disable Commission Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to disable commission",
    });
  }
};