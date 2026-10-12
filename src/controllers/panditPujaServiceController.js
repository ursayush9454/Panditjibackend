const mongoose = require("mongoose");

const PanditPujaService = require("../models/PanditPujaService");
const Vendor = require("../models/Vendor");
const Puja = require("../models/Puja");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ======================================================
// HELPERS
// ======================================================

const getPandit = async (userId) => {
  return Vendor.findOne({
    user: userId,
    role: "pandit",
  });
};

const validatePrice = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 0;
  }

  const price = Number(value);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error(
      "Price must be a valid non-negative number"
    );
  }

  return price;
};

const validateDuration = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 60;
  }

  const duration = Number(value);

  if (
    !Number.isInteger(duration) ||
    duration < 1
  ) {
    throw new Error(
      "Duration must be a positive integer"
    );
  }

  return duration;
};

// ======================================================
// PANDIT - CREATE SERVICE
// ======================================================

exports.createService = async (req, res) => {
  try {
    const {
      pujaId,
      title,
      description,
      price,
      pujaPrice,
      durationMinutes,
      serviceMode,
      homeService,
      templeService,
      panditLocation,
      customerLocation,
      samagriAvailable,
      samagriIncluded,
      samagriPrice,
      requirements,
      instructions,
      benefits,
    } = req.body;

    // --------------------------------------------------
    // PANDIT
    // --------------------------------------------------

    const pandit = await getPandit(req.user.id);

    if (!pandit) {
      return res.status(403).json({
        success: false,
        message:
          "Pandit profile not found",
      });
    }

    if (pandit.status !== "approved") {
      return res.status(403).json({
        success: false,
        message:
          "Approved pandit profile required",
      });
    }

    // --------------------------------------------------
    // PUJA
    // --------------------------------------------------

    if (!pujaId) {
      return res.status(400).json({
        success: false,
        message: "pujaId is required",
      });
    }

    if (!isValidObjectId(pujaId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pujaId",
      });
    }

    const puja = await Puja.findOne({
      _id: pujaId,
      isActive: true,
    });

    if (!puja) {
      return res.status(404).json({
        success: false,
        message:
          "Puja not found or inactive",
      });
    }

    // --------------------------------------------------
    // DUPLICATE CHECK
    // --------------------------------------------------

    const existing =
      await PanditPujaService.findOne({
        pandit: pandit._id,
        puja: puja._id,
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "You have already added this Puja",
        service: existing,
      });
    }

    // --------------------------------------------------
    // VALIDATE
    // --------------------------------------------------

    const finalPrice =
      validatePrice(price);

    const finalDuration =
      validateDuration(
        durationMinutes
      );

    const finalPujaPrice =
      pujaPrice === null ||
      pujaPrice === undefined ||
      pujaPrice === ""
        ? null
        : validatePrice(
            pujaPrice
          );

    const finalSamagriPrice =
      validatePrice(
        samagriPrice
      );

    const allowedModes = [
      "offline",
      "online",
      "both",
    ];

    const finalServiceMode =
      serviceMode || "offline";

    if (
      !allowedModes.includes(
        finalServiceMode
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid serviceMode",
      });
    }

    // --------------------------------------------------
    // CREATE
    // --------------------------------------------------

    const service =
      await PanditPujaService.create({
        pandit: pandit._id,
        puja: puja._id,

        title:
          title?.trim() ||
          puja.name,

        description:
          description?.trim() || "",

        price: finalPrice,

        pujaPrice:
          finalPujaPrice,

        durationMinutes:
          finalDuration,

        serviceMode:
          finalServiceMode,

        homeService:
          homeService !== undefined
            ? Boolean(homeService)
            : true,

        templeService:
          templeService !== undefined
            ? Boolean(templeService)
            : false,

        panditLocation:
          panditLocation !== undefined
            ? Boolean(panditLocation)
            : false,

        customerLocation:
          customerLocation !== undefined
            ? Boolean(customerLocation)
            : true,

        samagriAvailable:
          samagriAvailable !== undefined
            ? Boolean(
                samagriAvailable
              )
            : false,

        samagriIncluded:
          samagriIncluded !== undefined
            ? Boolean(
                samagriIncluded
              )
            : false,

        samagriPrice:
          finalSamagriPrice,

        requirements:
          Array.isArray(
            requirements
          )
            ? requirements
                .map((item) =>
                  String(item).trim()
                )
                .filter(Boolean)
            : [],

        instructions:
          Array.isArray(
            instructions
          )
            ? instructions
                .map((item) =>
                  String(item).trim()
                )
                .filter(Boolean)
            : [],

        benefits:
          Array.isArray(benefits)
            ? benefits
                .map((item) =>
                  String(item).trim()
                )
                .filter(Boolean)
            : [],

        isActive: true,
      });

    const populated =
      await PanditPujaService.findById(
        service._id
      )
        .populate(
          "puja",
          "name slug description benefits category basePrice durationMinutes image samagriAvailable samagriComboPrice"
        )
        .populate(
          "pandit",
          "name email phone role city state profileImage experience"
        );

    return res.status(201).json({
      success: true,
      message:
        "Puja service added successfully",
      service: populated,
    });
  } catch (error) {
    console.error(
      "Create Pandit Puja Service Error:",
      error
    );

    if (
      error.code === 11000
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This Puja is already added to your services",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to create Puja service",
    });
  }
};

// ======================================================
// PANDIT - MY SERVICES
// ======================================================

exports.getMyServices = async (
  req,
  res
) => {
  try {
    const pandit =
      await getPandit(req.user.id);

    if (!pandit) {
      return res.status(403).json({
        success: false,
        message:
          "Pandit profile not found",
      });
    }

    const {
      active,
      featured,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {
      pandit: pandit._id,
    };

    if (active !== undefined) {
      filter.isActive =
        active === "true";
    }

    if (featured !== undefined) {
      filter.isFeatured =
        featured === "true";
    }

    const skip =
      (Number(page) - 1) *
      Number(limit);

    let services =
      await PanditPujaService.find(
        filter
      )
        .populate(
          "puja",
          "name slug description benefits category basePrice durationMinutes image samagriAvailable samagriComboPrice samagriTitle samagriDescription"
        )
        .sort({
          sortOrder: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    if (search) {
      const term =
        String(search)
          .trim()
          .toLowerCase();

      services =
        services.filter(
          (service) => {
            const title =
              service.title ||
              "";

            const pujaName =
              service.puja?.name ||
              "";

            const description =
              service.description ||
              "";

            return (
              title
                .toLowerCase()
                .includes(term) ||
              pujaName
                .toLowerCase()
                .includes(term) ||
              description
                .toLowerCase()
                .includes(term)
            );
          }
        );
    }

    const total =
      await PanditPujaService.countDocuments(
        filter
      );

    return res.json({
      success: true,
      count: services.length,
      services,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(
          total / Number(limit)
        ),
      },
    });
  } catch (error) {
    console.error(
      "Get My Pandit Puja Services Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch your Puja services",
    });
  }
};

// ======================================================
// CUSTOMER - ALL PANDIT SERVICES
// ======================================================

exports.getPanditServices = async (
  req,
  res
) => {
  try {
    const {
      panditId,
      pujaId,
      serviceMode,
      city,
      minPrice,
      maxPrice,
      featured,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {
      isActive: true,
      adminApproved: true,
    };

    if (
      panditId
    ) {
      if (
        !isValidObjectId(
          panditId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid panditId",
        });
      }

      filter.pandit = panditId;
    }

    if (pujaId) {
      if (
        !isValidObjectId(
          pujaId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid pujaId",
        });
      }

      filter.puja = pujaId;
    }

    if (serviceMode) {
      filter.serviceMode =
        serviceMode;
    }

    if (featured !== undefined) {
      filter.isFeatured =
        featured === "true";
    }

    if (
      minPrice !== undefined
    ) {
      filter.price = {
        ...(filter.price || {}),
        $gte: Number(minPrice),
      };
    }

    if (
      maxPrice !== undefined
    ) {
      filter.price = {
        ...(filter.price || {}),
        $lte: Number(maxPrice),
      };
    }

    const skip =
      (Number(page) - 1) *
      Number(limit);

    let services =
      await PanditPujaService.find(
        filter
      )
        .populate(
          "pandit",
          "name email phone role city state profileImage experience bio isOnline status"
        )
        .populate(
          "puja",
          "name slug description benefits category basePrice durationMinutes image samagriAvailable samagriComboPrice samagriTitle samagriDescription"
        )
        .sort({
          isFeatured: -1,
          rating: -1,
          totalBookings: -1,
          sortOrder: 1,
        })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    // Only approved and active pandits
    services =
      services.filter(
        (service) =>
          service.pandit &&
          service.pandit.status ===
            "approved"
      );

    if (city) {
      const cityTerm =
        String(city)
          .trim()
          .toLowerCase();

      services =
        services.filter(
          (service) =>
            service.pandit?.city
              ?.toLowerCase()
              .includes(
                cityTerm
              )
        );
    }

    if (search) {
      const term =
        String(search)
          .trim()
          .toLowerCase();

      services =
        services.filter(
          (service) => {
            const serviceTitle =
              service.title ||
              "";

            const pujaName =
              service.puja?.name ||
              "";

            const panditName =
              service.pandit?.name ||
              "";

            return (
              serviceTitle
                .toLowerCase()
                .includes(term) ||
              pujaName
                .toLowerCase()
                .includes(term) ||
              panditName
                .toLowerCase()
                .includes(term)
            );
          }
        );
    }

    const total =
      await PanditPujaService.countDocuments(
        filter
      );

    return res.json({
      success: true,
      count: services.length,
      services,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(
          total / Number(limit)
        ),
      },
    });
  } catch (error) {
    console.error(
      "Get Pandit Puja Services Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch Pandit Puja services",
    });
  }
};

// ======================================================
// GET SINGLE SERVICE
// ======================================================

exports.getService = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid service ID",
      });
    }

    const service =
      await PanditPujaService.findById(
        id
      )
        .populate(
          "pandit",
          "name email phone role city state address profileImage experience bio isOnline status"
        )
        .populate(
          "puja",
          "name slug description benefits category basePrice durationMinutes image samagriAvailable samagriComboPrice samagriTitle samagriDescription"
        );

    if (!service) {
      return res.status(404).json({
        success: false,
        message:
          "Puja service not found",
      });
    }

    if (
      !service.isActive ||
      !service.adminApproved
    ) {
      const pandit =
        await getPandit(
          req.user?.id
        );

      const isOwner =
        pandit &&
        String(
          pandit._id
        ) ===
          String(
            service.pandit._id ||
              service.pandit
          );

      if (
        req.user?.role !==
          "admin" &&
        !isOwner
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Puja service is not available",
        });
      }
    }

    return res.json({
      success: true,
      service,
    });
  } catch (error) {
    console.error(
      "Get Pandit Puja Service Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch Puja service",
    });
  }
};

// ======================================================
// PANDIT - UPDATE SERVICE
// ======================================================

exports.updateService = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid service ID",
      });
    }

    const pandit =
      await getPandit(req.user.id);

    if (!pandit) {
      return res.status(403).json({
        success: false,
        message:
          "Pandit profile not found",
      });
    }

    const service =
      await PanditPujaService.findOne({
        _id: id,
        pandit: pandit._id,
      });

    if (!service) {
      return res.status(404).json({
        success: false,
        message:
          "Puja service not found",
      });
    }

    const {
      title,
      description,
      price,
      pujaPrice,
      durationMinutes,
      serviceMode,
      homeService,
      templeService,
      panditLocation,
      customerLocation,
      samagriAvailable,
      samagriIncluded,
      samagriPrice,
      requirements,
      instructions,
      benefits,
      isActive,
      isFeatured,
      sortOrder,
    } = req.body;

    if (title !== undefined) {
      service.title =
        String(title).trim();
    }

    if (
      description !==
      undefined
    ) {
      service.description =
        String(
          description
        ).trim();
    }

    if (price !== undefined) {
      service.price =
        validatePrice(price);
    }

    if (
      pujaPrice !== undefined
    ) {
      service.pujaPrice =
        pujaPrice === null ||
        pujaPrice === ""
          ? null
          : validatePrice(
              pujaPrice
            );
    }

    if (
      durationMinutes !==
      undefined
    ) {
      service.durationMinutes =
        validateDuration(
          durationMinutes
        );
    }

    if (
      serviceMode !==
      undefined
    ) {
      const allowedModes = [
        "offline",
        "online",
        "both",
      ];

      if (
        !allowedModes.includes(
          serviceMode
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid serviceMode",
        });
      }

      service.serviceMode =
        serviceMode;
    }

    if (
      homeService !==
      undefined
    ) {
      service.homeService =
        Boolean(
          homeService
        );
    }

    if (
      templeService !==
      undefined
    ) {
      service.templeService =
        Boolean(
          templeService
        );
    }

    if (
      panditLocation !==
      undefined
    ) {
      service.panditLocation =
        Boolean(
          panditLocation
        );
    }

    if (
      customerLocation !==
      undefined
    ) {
      service.customerLocation =
        Boolean(
          customerLocation
        );
    }

    if (
      samagriAvailable !==
      undefined
    ) {
      service.samagriAvailable =
        Boolean(
          samagriAvailable
        );
    }

    if (
      samagriIncluded !==
      undefined
    ) {
      service.samagriIncluded =
        Boolean(
          samagriIncluded
        );
    }

    if (
      samagriPrice !==
      undefined
    ) {
      service.samagriPrice =
        validatePrice(
          samagriPrice
        );
    }

    if (
      requirements !==
      undefined
    ) {
      service.requirements =
        Array.isArray(
          requirements
        )
          ? requirements
              .map((item) =>
                String(
                  item
                ).trim()
              )
              .filter(Boolean)
          : [];
    }

    if (
      instructions !==
      undefined
    ) {
      service.instructions =
        Array.isArray(
          instructions
        )
          ? instructions
              .map((item) =>
                String(
                  item
                ).trim()
              )
              .filter(Boolean)
          : [];
    }

    if (
      benefits !==
      undefined
    ) {
      service.benefits =
        Array.isArray(
          benefits
        )
          ? benefits
              .map((item) =>
                String(
                  item
                ).trim()
              )
              .filter(Boolean)
          : [];
    }

    if (
      isActive !==
      undefined
    ) {
      service.isActive =
        Boolean(isActive);
    }

    if (
      isFeatured !==
      undefined
    ) {
      service.isFeatured =
        Boolean(
          isFeatured
        );
    }

    if (
      sortOrder !==
      undefined
    ) {
      service.sortOrder =
        Number(sortOrder);
    }

    await service.save();

    const populated =
      await PanditPujaService.findById(
        service._id
      )
        .populate(
          "pandit",
          "name email phone role city state profileImage experience"
        )
        .populate(
          "puja",
          "name slug description benefits category basePrice durationMinutes image samagriAvailable samagriComboPrice"
        );

    return res.json({
      success: true,
      message:
        "Puja service updated successfully",
      service: populated,
    });
  } catch (error) {
    console.error(
      "Update Pandit Puja Service Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update Puja service",
    });
  }
};

// ======================================================
// PANDIT - TOGGLE ACTIVE STATUS
// ======================================================

exports.toggleService = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid service ID",
      });
    }

    const pandit =
      await getPandit(req.user.id);

    if (!pandit) {
      return res.status(403).json({
        success: false,
        message:
          "Pandit profile not found",
      });
    }

    const service =
      await PanditPujaService.findOne({
        _id: id,
        pandit: pandit._id,
      });

    if (!service) {
      return res.status(404).json({
        success: false,
        message:
          "Puja service not found",
      });
    }

    service.isActive =
      !service.isActive;

    await service.save();

    return res.json({
      success: true,
      message: service.isActive
        ? "Puja service activated"
        : "Puja service deactivated",
      isActive:
        service.isActive,
      service,
    });
  } catch (error) {
    console.error(
      "Toggle Pandit Puja Service Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update service status",
    });
  }
};

// ======================================================
// PANDIT - DELETE SERVICE
// ======================================================

exports.deleteService = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid service ID",
      });
    }

    const pandit =
      await getPandit(req.user.id);

    if (!pandit) {
      return res.status(403).json({
        success: false,
        message:
          "Pandit profile not found",
      });
    }

    const service =
      await PanditPujaService.findOne({
        _id: id,
        pandit: pandit._id,
      });

    if (!service) {
      return res.status(404).json({
        success: false,
        message:
          "Puja service not found",
      });
    }

    // Don't hard delete if bookings exist.
    if (
      service.totalBookings >
      0
    ) {
      service.isActive =
        false;

      await service.save();

      return res.json({
        success: true,
        message:
          "Service has bookings, so it was deactivated instead of deleted",
        service,
      });
    }

    await PanditPujaService.deleteOne({
      _id: service._id,
    });

    return res.json({
      success: true,
      message:
        "Puja service deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete Pandit Puja Service Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete Puja service",
    });
  }
};

// ======================================================
// ADMIN - ALL SERVICES
// ======================================================

exports.adminGetServices = async (
  req,
  res
) => {
  try {
    const {
      panditId,
      pujaId,
      isActive,
      adminApproved,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (panditId) {
      if (
        !isValidObjectId(
          panditId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid panditId",
        });
      }

      filter.pandit =
        panditId;
    }

    if (pujaId) {
      if (
        !isValidObjectId(
          pujaId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid pujaId",
        });
      }

      filter.puja =
        pujaId;
    }

    if (
      isActive !==
      undefined
    ) {
      filter.isActive =
        isActive === "true";
    }

    if (
      adminApproved !==
      undefined
    ) {
      filter.adminApproved =
        adminApproved ===
        "true";
    }

    const skip =
      (Number(page) - 1) *
      Number(limit);

    let services =
      await PanditPujaService.find(
        filter
      )
        .populate(
          "pandit",
          "name email phone role city state status profileImage experience"
        )
        .populate(
          "puja",
          "name slug category basePrice durationMinutes image"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    if (search) {
      const term =
        String(search)
          .trim()
          .toLowerCase();

      services =
        services.filter(
          (service) =>
            service.title
              ?.toLowerCase()
              .includes(term) ||
            service.pandit?.name
              ?.toLowerCase()
              .includes(term) ||
            service.puja?.name
              ?.toLowerCase()
              .includes(term)
        );
    }

    const total =
      await PanditPujaService.countDocuments(
        filter
      );

    return res.json({
      success: true,
      services,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(
          total / Number(limit)
        ),
      },
    });
  } catch (error) {
    console.error(
      "Admin Get Pandit Puja Services Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch Pandit Puja services",
    });
  }
};

// ======================================================
// ADMIN - UPDATE APPROVAL
// ======================================================

exports.adminUpdateApproval =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        adminApproved,
        adminNote,
      } = req.body;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid service ID",
        });
      }

      const service =
        await PanditPujaService.findById(
          id
        );

      if (!service) {
        return res.status(404).json({
          success: false,
          message:
            "Puja service not found",
        });
      }

      if (
        adminApproved !==
        undefined
      ) {
        service.adminApproved =
          Boolean(
            adminApproved
          );
      }

      if (
        adminNote !==
        undefined
      ) {
        service.adminNote =
          String(
            adminNote
          ).trim();
      }

      await service.save();

      return res.json({
        success: true,
        message:
          "Puja service approval updated successfully",
        service,
      });
    } catch (error) {
      console.error(
        "Admin Update Puja Service Approval Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update approval",
      });
    }
  };

// ======================================================
// ADMIN - DELETE SERVICE
// ======================================================

exports.adminDeleteService =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid service ID",
        });
      }

      const service =
        await PanditPujaService.findById(
          id
        );

      if (!service) {
        return res.status(404).json({
          success: false,
          message:
            "Puja service not found",
        });
      }

      if (
        service.totalBookings >
        0
      ) {
        service.isActive =
          false;

        service.adminApproved =
          false;

        await service.save();

        return res.json({
          success: true,
          message:
            "Service has bookings, so it was deactivated instead of deleted",
          service,
        });
      }

      await PanditPujaService.deleteOne({
        _id: id,
      });

      return res.json({
        success: true,
        message:
          "Puja service deleted successfully",
      });
    } catch (error) {
      console.error(
        "Admin Delete Puja Service Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete Puja service",
      });
    }
  };