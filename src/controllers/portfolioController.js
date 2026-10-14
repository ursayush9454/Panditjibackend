const Portfolio = require("../models/Portfolio");
const Vendor = require("../models/Vendor");

const getMandali = async (userId) => {
  return Vendor.findOne({
    user: userId,
    role: "mandali",
  });
};

// =====================================
// GET MY PORTFOLIO
// =====================================
exports.getPortfolio = async (req, res) => {
  try {
    const mandali = await getMandali(req.user.id);

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Mandali profile not found",
      });
    }

    const portfolio = await Portfolio.find({
      vendor: mandali._id,
    }).sort({
      createdAt: -1,
    });

    return res.json({
      success: true,
      count: portfolio.length,
      portfolio,
    });
  } catch (error) {
    console.error(
      "Get Portfolio Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch portfolio",
    });
  }
};

// =====================================
// CREATE PORTFOLIO
// =====================================
exports.createPortfolio = async (req, res) => {
  try {
    const {
      title,
      description,
      image,
      eventType,
      location,
      eventDate,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Portfolio title is required",
      });
    }

    const mandali = await getMandali(req.user.id);

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Mandali profile not found",
      });
    }

    if (mandali.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Mandali is not approved",
      });
    }

    const portfolio = await Portfolio.create({
      vendor: mandali._id,
      title: String(title).trim(),
      description: description || "",
      image: image || "",
      eventType: eventType || "",
      location: location || "",
      eventDate: eventDate || null,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Portfolio item created successfully",
      portfolio,
    });
  } catch (error) {
    console.error(
      "Create Portfolio Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create portfolio item",
    });
  }
};

// =====================================
// UPDATE PORTFOLIO
// =====================================
exports.updatePortfolio = async (req, res) => {
  try {
    const { id } = req.params;

    const mandali = await getMandali(req.user.id);

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Mandali profile not found",
      });
    }

    const portfolio = await Portfolio.findOne({
      _id: id,
      vendor: mandali._id,
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        message: "Portfolio item not found",
      });
    }

    const fields = [
      "title",
      "description",
      "image",
      "eventType",
      "location",
      "eventDate",
      "isActive",
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        portfolio[field] = req.body[field];
      }
    });

    await portfolio.save();

    return res.json({
      success: true,
      message: "Portfolio updated successfully",
      portfolio,
    });
  } catch (error) {
    console.error(
      "Update Portfolio Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update portfolio",
    });
  }
};

// =====================================
// DELETE PORTFOLIO
// =====================================
exports.deletePortfolio = async (req, res) => {
  try {
    const { id } = req.params;

    const mandali = await getMandali(req.user.id);

    if (!mandali) {
      return res.status(404).json({
        success: false,
        message: "Mandali profile not found",
      });
    }

    const portfolio = await Portfolio.findOne({
      _id: id,
      vendor: mandali._id,
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        message: "Portfolio item not found",
      });
    }

    portfolio.isActive = false;

    await portfolio.save();

    return res.json({
      success: true,
      message: "Portfolio item deactivated successfully",
      portfolio,
    });
  } catch (error) {
    console.error(
      "Delete Portfolio Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete portfolio item",
    });
  }
};