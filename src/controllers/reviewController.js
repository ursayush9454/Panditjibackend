
const mongoose = require("mongoose");

const Review = require("../models/Review");
const Vendor = require("../models/Vendor");
const Consultation = require("../models/Consultation");

const getUserId = (req) => req.user?._id || req.user?.id;

const isValidId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id || ""));

const getPagination = (query, defaultLimit = 10, maxLimit = 50) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(query.limit, 10) || defaultLimit)
  );

  return { page, limit, skip: (page - 1) * limit };
};

const publicReviewFilter = { status: "published" };

const ratingDistribution = (rows) => {
  const result = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  rows.forEach((row) => {
    if (row._id >= 1 && row._id <= 5) {
      result[row._id] = row.count;
    }
  });

  return result;
};

const getVendorForUser = async (userId, vendorId) => {
  return Vendor.findOne({
    _id: vendorId,
    user: userId,
  });
};

// =====================================================
// GET VENDOR REVIEWS
// GET /vendor/:vendorId
// =====================================================

exports.getVendorReviews = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!isValidId(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findById(vendorId)
      .select("name role status");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const { page, limit, skip } = getPagination(req.query);
    const filter = {
      vendor: vendorId,
      ...publicReviewFilter,
    };

    const [reviews, totalReviews, ratingStats, distributionRows] =
      await Promise.all([
        Review.find(filter)
          .select("-reports -adminNote -moderatedBy -metadata")
          .populate("customer", "name")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),

        Review.countDocuments(filter),

        Review.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              total: { $sum: 1 },
            },
          },
        ]),

        Review.aggregate([
          { $match: filter },
          { $group: { _id: "$rating", count: { $sum: 1 } } },
        ]),
      ]);

    return res.json({
      success: true,
      vendor,
      summary: {
        totalReviews,
        averageRating: Number(
          (ratingStats[0]?.averageRating || 0).toFixed(1)
        ),
        distribution: ratingDistribution(distributionRows),
      },
      pagination: {
        page,
        limit,
        total: totalReviews,
        totalPages: Math.ceil(totalReviews / limit),
      },
      reviews,
    });
  } catch (error) {
    console.error("Get Vendor Reviews Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
    });
  }
};

// =====================================================
// CREATE REVIEW
// POST /
// =====================================================

exports.createReview = async (req, res) => {
  try {
    const {
      vendorId,
      consultationId,
      bookingId,
      rating,
      title,
      comment,
      categoryRatings,
      serviceType,
    } = req.body;

    const customerId = getUserId(req);

    if (!customerId || !isValidId(vendorId) || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "Valid vendor ID and rating are required",
      });
    }

    if (!isValidId(customerId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid authenticated user",
      });
    }

    const numericRating = Number(rating);

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5",
      });
    }

    if (consultationId && !isValidId(consultationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid consultation ID",
      });
    }

    if (bookingId && !isValidId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    if (consultationId && bookingId) {
      return res.status(400).json({
        success: false,
        message: "Provide either consultationId or bookingId, not both",
      });
    }

    if (bookingId) {
      return res.status(400).json({
        success: false,
        message:
          "Booking review verification is not configured in this controller yet. Use consultationId for now.",
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    let verifiedConsultation = null;

    if (consultationId) {
      verifiedConsultation = await Consultation.findOne({
        _id: consultationId,
        customer: customerId,
        astrologer: vendorId,
        status: "completed",
      });

      if (!verifiedConsultation) {
        return res.status(400).json({
          success: false,
          message: "Completed consultation not found for this customer and vendor",
        });
      }
    }

    const duplicateFilter = {
      customer: customerId,
      vendor: vendorId,
    };

    if (consultationId) {
      duplicateFilter.consultation = consultationId;
    } else {
      duplicateFilter.consultation = null;
    }

    const existingReview = await Review.findOne(duplicateFilter);

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this vendor/consultation",
      });
    }

    const allowedServiceTypes = [
      "chat",
      "audio",
      "video",
      "pandit",
      "merchant",
      "mandali",
      "booking",
      "other",
    ];

    const cleanCategoryRatings = {};

    if (
      categoryRatings !== undefined &&
      (!categoryRatings ||
        typeof categoryRatings !== "object" ||
        Array.isArray(categoryRatings))
    ) {
      return res.status(400).json({
        success: false,
        message: "categoryRatings must be an object",
      });
    }

    const allowedCategories = [
      "communication",
      "knowledge",
      "behaviour",
      "punctuality",
      "serviceQuality",
    ];

    for (const key of allowedCategories) {
      if (
        categoryRatings &&
        categoryRatings[key] !== undefined &&
        categoryRatings[key] !== null &&
        categoryRatings[key] !== ""
      ) {
        const value = Number(categoryRatings[key]);

        if (!Number.isInteger(value) || value < 1 || value > 5) {
          return res.status(400).json({
            success: false,
            message: `${key} rating must be between 1 and 5`,
          });
        }

        cleanCategoryRatings[key] = value;
      }
    }

    const selectedServiceType = allowedServiceTypes.includes(serviceType)
      ? serviceType
      : "other";

    const review = await Review.create({
      vendor: vendorId,
      customer: customerId,
      consultation: consultationId || null,
      booking: null,
      rating: numericRating,
      title: String(title || "").trim().slice(0, 150),
      comment: String(comment || "").trim().slice(0, 2000),
      categoryRatings: cleanCategoryRatings,
      serviceType: selectedServiceType,
      status: "published",
      isVerified: Boolean(verifiedConsultation),
    });

    const populatedReview = await Review.findById(review._id)
      .populate("customer", "name")
      .populate("vendor", "name role");

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review: populatedReview,
    });
  } catch (error) {
    console.error("Create Review Error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A duplicate review is not allowed",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create review",
    });
  }
};

// =====================================================
// GET MY REVIEWS
// GET /my
// =====================================================

exports.getMyReviews = async (req, res) => {
  try {
    const customerId = getUserId(req);

    if (!customerId || !isValidId(customerId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { page, limit, skip } = getPagination(req.query);
    const filter = { customer: customerId };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("vendor", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Review.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get My Reviews Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your reviews",
    });
  }
};

// =====================================================
// BACKWARD-COMPATIBLE REVIEW LOOKUP
// =====================================================

exports.getMyReview = async (req, res) => {
  try {
    const customerId = getUserId(req);
    const { vendorId } = req.params;

    if (!isValidId(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const review = await Review.findOne({
      vendor: vendorId,
      customer: customerId,
    });

    return res.json({
      success: true,
      exists: Boolean(review),
      review: review || null,
    });
  } catch (error) {
    console.error("Get My Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch review",
    });
  }
};

// =====================================================
// GET SINGLE PUBLIC REVIEW
// GET /:id
// =====================================================

exports.getReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findOne({
      _id: id,
      ...publicReviewFilter,
    })
      .select("-reports -adminNote -moderatedBy -metadata")
      .populate("customer", "name")
      .populate("vendor", "name role");

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    return res.json({ success: true, review });
  } catch (error) {
    console.error("Get Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch review",
    });
  }
};

// =====================================================
// UPDATE OWN REVIEW
// PUT /:id
// =====================================================

exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = getUserId(req);
    const { rating, title, comment, categoryRatings } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findOne({
      _id: id,
      customer: customerId,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (review.status === "hidden" || review.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "This review cannot be edited in its current status",
      });
    }

    if (rating !== undefined) {
      const value = Number(rating);

      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be an integer between 1 and 5",
        });
      }

      review.rating = value;
    }

    if (title !== undefined) {
      review.title = String(title || "").trim().slice(0, 150);
    }

    if (comment !== undefined) {
      review.comment = String(comment || "").trim().slice(0, 2000);
    }

    if (categoryRatings !== undefined) {
      if (
        !categoryRatings ||
        typeof categoryRatings !== "object" ||
        Array.isArray(categoryRatings)
      ) {
        return res.status(400).json({
          success: false,
          message: "categoryRatings must be an object",
        });
      }

      const allowedCategories = [
        "communication",
        "knowledge",
        "behaviour",
        "punctuality",
        "serviceQuality",
      ];

      for (const key of allowedCategories) {
        if (categoryRatings[key] === undefined) continue;

        if (categoryRatings[key] === null || categoryRatings[key] === "") {
          review.categoryRatings.set(key, null);
          continue;
        }

        const value = Number(categoryRatings[key]);

        if (!Number.isInteger(value) || value < 1 || value > 5) {
          return res.status(400).json({
            success: false,
            message: `${key} rating must be between 1 and 5`,
          });
        }

        review.categoryRatings.set(key, value);
      }
    }

    review.isEdited = true;
    review.editedAt = new Date();

    await review.save();

    return res.json({
      success: true,
      message: "Review updated successfully",
      review,
    });
  } catch (error) {
    console.error("Update Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update review",
    });
  }
};

// =====================================================
// DELETE OWN REVIEW
// DELETE /:id
// =====================================================

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findOne({
      _id: id,
      customer: getUserId(req),
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    await review.deleteOne();

    return res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete review",
    });
  }
};

// =====================================================
// MARK / UNMARK REVIEW HELPFUL
// POST /:id/helpful
// =====================================================

exports.markHelpful = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId || !isValidId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findOne({
      _id: id,
      ...publicReviewFilter,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Published review not found",
      });
    }

    if (String(review.customer) === String(userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot mark your own review as helpful",
      });
    }

    const alreadyHelpful = review.helpfulUsers.some(
      (existingUserId) => String(existingUserId) === String(userId)
    );

    if (alreadyHelpful) {
      review.helpfulUsers.pull(userId);
    } else {
      review.helpfulUsers.addToSet(userId);
    }

    review.helpfulCount = review.helpfulUsers.length;

    await review.save();

    return res.json({
      success: true,
      message: alreadyHelpful
        ? "Helpful vote removed"
        : "Review marked as helpful",
      helpful: !alreadyHelpful,
      helpfulCount: review.helpfulCount,
    });
  } catch (error) {
    console.error("Mark Helpful Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update helpful vote",
    });
  }
};

// =====================================================
// REPORT REVIEW
// POST /:id/report
// Body: { reason: "..." }
// =====================================================

exports.reportReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const reason = String(req.body.reason || "").trim();

    if (!userId || !isValidId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    if (!reason || reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Report reason is required and must not exceed 500 characters",
      });
    }

    const review = await Review.findById(id);

    if (!review || review.status !== "published") {
      return res.status(404).json({
        success: false,
        message: "Published review not found",
      });
    }

    if (String(review.customer) === String(userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot report your own review",
      });
    }

    const alreadyReported = review.reports.some(
      (report) => String(report.user) === String(userId)
    );

    if (alreadyReported) {
      return res.status(409).json({
        success: false,
        message: "You have already reported this review",
      });
    }

    review.reports.push({
      user: userId,
      reason,
      reportedAt: new Date(),
    });

    // Hide it from public listings pending admin review.
    review.status = "reported";

    await review.save();

    return res.json({
      success: true,
      message: "Review reported successfully and sent for moderation",
    });
  } catch (error) {
    console.error("Report Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to report review",
    });
  }
};

// =====================================================
// VENDOR REPLY
// POST /:id/reply
// Body: { text: "..." }
// =====================================================

exports.replyToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const text = String(req.body.text || "").trim();

    if (!userId || !isValidId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    if (!text || text.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Reply is required and must not exceed 2000 characters",
      });
    }

    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const vendor = await getVendorForUser(userId, review.vendor);

    if (!vendor) {
      return res.status(403).json({
        success: false,
        message: "You can only reply to reviews for your own vendor profile",
      });
    }

    if (review.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Cannot reply to a rejected review",
      });
    }

    review.vendorReply = {
      text,
      repliedAt: new Date(),
    };

    await review.save();

    return res.json({
      success: true,
      message: "Vendor reply saved successfully",
      vendorReply: review.vendorReply,
    });
  } catch (error) {
    console.error("Reply To Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save vendor reply",
    });
  }
};

// =====================================================
// ADMIN LIST REVIEWS
// GET /admin/all
// =====================================================

exports.getAllReviews = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const filter = {};

    if (req.query.status) {
      const allowedStatuses = [
        "pending",
        "published",
        "hidden",
        "rejected",
        "reported",
      ];

      if (!allowedStatuses.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid review status filter",
        });
      }

      filter.status = req.query.status;
    }

    if (req.query.rating !== undefined) {
      const rating = Number(req.query.rating);

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating filter must be between 1 and 5",
        });
      }

      filter.rating = rating;
    }

    if (req.query.vendorId) {
      if (!isValidId(req.query.vendorId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendor ID filter",
        });
      }

      filter.vendor = req.query.vendorId;
    }

    if (req.query.customerId) {
      if (!isValidId(req.query.customerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid customer ID filter",
        });
      }

      filter.customer = req.query.customerId;
    }

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("customer", "name phone")
        .populate("vendor", "name role")
        .populate("moderatedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Review.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get All Reviews Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
    });
  }
};

// =====================================================
// ADMIN REVIEW STATS
// GET /admin/stats
// =====================================================

exports.getReviewStats = async (req, res) => {
  try {
    const [total, statusRows, ratingRows] = await Promise.all([
      Review.countDocuments(),

      Review.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      Review.aggregate([
        { $match: publicReviewFilter },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts = {
      pending: 0,
      published: 0,
      hidden: 0,
      rejected: 0,
      reported: 0,
    };

    statusRows.forEach((row) => {
      statusCounts[row._id] = row.count;
    });

    return res.json({
      success: true,
      stats: {
        total,
        ...statusCounts,
        averageRating: await Review.aggregate([
          { $match: publicReviewFilter },
          {
            $group: {
              _id: null,
              average: { $avg: "$rating" },
            },
          },
        ]).then((rows) =>
          Number((rows[0]?.average || 0).toFixed(1))
        ),
        ratings: ratingDistribution(ratingRows),
      },
    });
  } catch (error) {
    console.error("Get Review Stats Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch review stats",
    });
  }
};

// =====================================================
// ADMIN MODERATION
// PUT /admin/:id/moderate
// Body: { status: "published" | "hidden" | "rejected" | "pending",
//         adminNote: "optional note" }
// =====================================================

exports.moderateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const allowedStatuses = [
      "pending",
      "published",
      "hidden",
      "rejected",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "status must be pending, published, hidden, or rejected",
      });
    }

    if (
      adminNote !== undefined &&
      String(adminNote).trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Admin note must not exceed 1000 characters",
      });
    }

    const update = {
      status,
      moderatedBy: getUserId(req),
      moderatedAt: new Date(),
    };

    if (adminNote !== undefined) {
      update.adminNote = String(adminNote).trim();
    }

    const review = await Review.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate("customer", "name")
      .populate("vendor", "name role")
      .populate("moderatedBy", "name");

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    return res.json({
      success: true,
      message: `Review status updated to ${status}`,
      review,
    });
  } catch (error) {
    console.error("Moderate Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to moderate review",
    });
  }
};