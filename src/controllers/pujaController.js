const mongoose = require("mongoose");

const Puja = require("../models/Puja");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ======================================================
// GET ALL PUJAS
// ======================================================

exports.getPujas = async (req, res) => {
  try {
    const {
      category,
      search,
      featured,
    } = req.query;

    const filter = {
      isActive: true,
    };

    if (category) {
      filter.category = category;
    }

    if (featured === "true") {
      filter.isFeatured = true;
    }

    if (search && search.trim()) {
      filter.$text = {
        $search: search.trim(),
      };
    }

    const pujas = await Puja.find(filter)
      .populate(
        "samagriProducts",
        "name price image stock isActive"
      )
      .sort({
        sortOrder: 1,
        createdAt: -1,
      });

    return res.json({
      success: true,
      total: pujas.length,
      pujas,
    });
  } catch (error) {
    console.error("Get Pujas Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pujas",
    });
  }
};

// ======================================================
// GET SINGLE PUJA
// ======================================================

exports.getPuja = async (req, res) => {
  try {
    const { id } = req.params;

    let filter = {
      isActive: true,
    };

    if (isValidObjectId(id)) {
      filter._id = id;
    } else {
      filter.slug = id;
    }

    const puja = await Puja.findOne(filter).populate(
      "samagriProducts",
      "name price image stock isActive"
    );

    if (!puja) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }

    return res.json({
      success: true,
      puja,
    });
  } catch (error) {
    console.error("Get Puja Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch puja",
    });
  }
};

// ======================================================
// ADMIN CREATE PUJA
// ======================================================

exports.createPuja = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const {
      name,
      slug,
      shortDescription,
      description,
      benefits,
      durationMinutes,
      basePrice,
      category,
      samagriAvailable,
      samagriProducts,
      samagriComboPrice,
      samagriTitle,
      samagriDescription,
      image,
      gallery,
      isFeatured,
      sortOrder,
      metadata,
    } = req.body;

    if (!name || !slug || !description) {
      return res.status(400).json({
        success: false,
        message:
          "Name, slug and description are required",
      });
    }

    const existing = await Puja.findOne({
      slug: slug.toLowerCase().trim(),
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Puja with this slug already exists",
      });
    }

    const puja = await Puja.create({
      name,
      slug: slug.toLowerCase().trim(),
      shortDescription: shortDescription || "",
      description,
      benefits: Array.isArray(benefits)
        ? benefits
        : [],
      durationMinutes:
        Number(durationMinutes) || 60,
      basePrice: Math.max(
        0,
        Number(basePrice) || 0
      ),
      category: category || "other",
      samagriAvailable:
        Boolean(samagriAvailable),
      samagriProducts:
        Array.isArray(samagriProducts)
          ? samagriProducts
          : [],
      samagriComboPrice: Math.max(
        0,
        Number(samagriComboPrice) || 0
      ),
      samagriTitle:
        samagriTitle ||
        "Puja Samagri Combo",
      samagriDescription:
        samagriDescription || "",
      image: image || "",
      gallery:
        Array.isArray(gallery)
          ? gallery
          : [],
      isFeatured:
        Boolean(isFeatured),
      sortOrder:
        Number(sortOrder) || 0,
      metadata: metadata || {},
    });

    return res.status(201).json({
      success: true,
      message: "Puja created successfully",
      puja,
    });
  } catch (error) {
    console.error("Create Puja Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create puja",
    });
  }
};

// ======================================================
// ADMIN UPDATE PUJA
// ======================================================

exports.updatePuja = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid puja ID",
      });
    }

    const allowedFields = [
      "name",
      "slug",
      "shortDescription",
      "description",
      "benefits",
      "durationMinutes",
      "basePrice",
      "category",
      "samagriAvailable",
      "samagriProducts",
      "samagriComboPrice",
      "samagriTitle",
      "samagriDescription",
      "image",
      "gallery",
      "isActive",
      "isFeatured",
      "sortOrder",
      "metadata",
    ];

    const update = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    });

    if (update.slug) {
      update.slug = String(
        update.slug
      )
        .toLowerCase()
        .trim();
    }

    if (update.basePrice !== undefined) {
      update.basePrice = Math.max(
        0,
        Number(update.basePrice) || 0
      );
    }

    if (
      update.samagrIComboPrice !==
      undefined
    ) {
      update.samagrIComboPrice =
        Math.max(
          0,
          Number(
            update.samagrIComboPrice
          ) || 0
        );
    }

    if (
      update.samagrIComboPrice ===
      undefined &&
      update.samagriComboPrice !==
      undefined
    ) {
      update.samagriComboPrice =
        Math.max(
          0,
          Number(
            update.samagriComboPrice
          ) || 0
        );
    }

    const puja =
      await Puja.findByIdAndUpdate(
        req.params.id,
        {
          $set: update,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!puja) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }

    return res.json({
      success: true,
      message: "Puja updated successfully",
      puja,
    });
  } catch (error) {
    console.error("Update Puja Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update puja",
    });
  }
};

// ======================================================
// ADMIN UPDATE SAMAGRI
// ======================================================

exports.updatePujaSamagri = async (
  req,
  res
) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const {
      samagriAvailable,
      samagriProducts,
      samagriComboPrice,
      samagriTitle,
      samagriDescription,
    } = req.body;

    const puja =
      await Puja.findById(req.params.id);

    if (!puja) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }

    if (
      samagriAvailable !==
      undefined
    ) {
      puja.samagriAvailable =
        Boolean(samagriAvailable);
    }

    if (
      Array.isArray(samagriProducts)
    ) {
      puja.samagriProducts =
        samagriProducts;
    }

    if (
      samagriComboPrice !==
      undefined
    ) {
      puja.samagriComboPrice =
        Math.max(
          0,
          Number(
            samagriComboPrice
          ) || 0
        );
    }

    if (samagriTitle !== undefined) {
      puja.samagriTitle =
        samagriTitle;
    }

    if (
      samagriDescription !==
      undefined
    ) {
      puja.samagriDescription =
        samagriDescription;
    }

    await puja.save();

    return res.json({
      success: true,
      message:
        "Puja samagri updated successfully",
      puja,
    });
  } catch (error) {
    console.error(
      "Update Puja Samagri Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update puja samagri",
    });
  }
};

// ======================================================
// ADMIN DELETE / DISABLE PUJA
// ======================================================

exports.deletePuja = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const puja =
      await Puja.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            isActive: false,
          },
        },
        {
          new: true,
        }
      );

    if (!puja) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }

    return res.json({
      success: true,
      message: "Puja disabled successfully",
      puja,
    });
  } catch (error) {
    console.error("Delete Puja Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to disable puja",
    });
  }
};