const mongoose = require("mongoose");

const Review =
  require("../models/Review");

const Vendor =
  require("../models/Vendor");

const {
  createReview,
  updateReview,
  deleteReview,
  replyToReview,
  markHelpful,
  reportReview,
  updateVendorRating,
} = require("../services/reviewService");

// =====================================================
// CREATE
// =====================================================

exports.createReview =
  async (req, res) => {
    try {
      const {
        vendor,
        booking,
        consultation,
        serviceType,
        rating,
        title,
        comment,
        categoryRatings,
      } = req.body;

      const review =
        await createReview({
          customer: req.user.id,
          vendor,
          booking,
          consultation,
          serviceType,
          rating,
          title,
          comment,
          categoryRatings,
        });

      return res.status(201).json({
        success: true,
        message:
          "Review submitted successfully",
        review,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// GET VENDOR REVIEWS
// =====================================================

exports.getVendorReviews =
  async (req, res) => {
    try {
      const {
        vendorId,
      } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          vendorId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid vendor ID",
        });
      }

      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number(req.query.limit) || 10,
          1
        ),
        100
      );

      const skip =
        (page - 1) * limit;

      const filter = {
        vendor: vendorId,
        status: "published",
      };

      if (req.query.rating) {
        filter.rating =
          Number(req.query.rating);
      }

      const [
        reviews,
        total,
        ratingStats,
      ] = await Promise.all([
        Review.find(filter)
          .populate(
            "customer",
            "name profileImage"
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Review.countDocuments(
          filter
        ),

        Review.aggregate([
          {
            $match: {
              vendor:
                new mongoose.Types.ObjectId(
                  vendorId
                ),
              status: "published",
            },
          },

          {
            $group: {
              _id: "$rating",
              count: {
                $sum: 1,
              },
            },
          },

          {
            $sort: {
              _id: -1,
            },
          },
        ]),
      ]);

      return res.json({
        success: true,
        reviews,
        ratingStats,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch reviews",
      });
    }
  };

// =====================================================
// MY REVIEWS
// =====================================================

exports.getMyReviews =
  async (req, res) => {
    try {
      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number(req.query.limit) || 20,
          1
        ),
        100
      );

      const skip =
        (page - 1) * limit;

      const filter = {
        customer: req.user.id,
      };

      const [
        reviews,
        total,
      ] = await Promise.all([
        Review.find(filter)
          .populate(
            "vendor",
            "name role profileImage"
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Review.countDocuments(
          filter
        ),
      ]);

      return res.json({
        success: true,
        reviews,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch your reviews",
      });
    }
  };

// =====================================================
// GET ONE
// =====================================================

exports.getReview =
  async (req, res) => {
    try {
      const review =
        await Review.findById(
          req.params.id
        )
          .populate(
            "customer",
            "name profileImage"
          )
          .populate(
            "vendor",
            "name role profileImage"
          )
          .populate(
            "booking"
          )
          .populate(
            "consultation"
          );

      if (!review) {
        return res.status(404).json({
          success: false,
          message:
            "Review not found",
        });
      }

      return res.json({
        success: true,
        review,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch review",
      });
    }
  };

// =====================================================
// UPDATE
// =====================================================

exports.updateReview =
  async (req, res) => {
    try {
      const review =
        await updateReview(
          req.params.id,
          req.user.id,
          req.body
        );

      return res.json({
        success: true,
        message:
          "Review updated successfully",
        review,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// DELETE
// =====================================================

exports.deleteReview =
  async (req, res) => {
    try {
      await deleteReview(
        req.params.id,
        req.user.id
      );

      return res.json({
        success: true,
        message:
          "Review deleted successfully",
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// VENDOR REPLY
// =====================================================

exports.replyToReview =
  async (req, res) => {
    try {
      const {
        text,
      } = req.body;

      const review =
        await replyToReview(
          req.params.id,
          req.user.id,
          text
        );

      return res.json({
        success: true,
        message:
          "Reply added successfully",
        review,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// HELPFUL
// =====================================================

exports.markHelpful =
  async (req, res) => {
    try {
      const review =
        await markHelpful(
          req.params.id,
          req.user.id
        );

      return res.json({
        success: true,
        message:
          "Helpful status updated",
        helpfulCount:
          review.helpfulCount,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// REPORT
// =====================================================

exports.reportReview =
  async (req, res) => {
    try {
      const {
        reason,
      } = req.body;

      await reportReview(
        req.params.id,
        req.user.id,
        reason
      );

      return res.json({
        success: true,
        message:
          "Review reported successfully",
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// ADMIN - ALL REVIEWS
// =====================================================

exports.getAllReviews =
  async (req, res) => {
    try {
      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number(req.query.limit) || 20,
          1
        ),
        100
      );

      const skip =
        (page - 1) * limit;

      const filter = {};

      if (req.query.status) {
        filter.status =
          req.query.status;
      }

      if (req.query.vendor) {
        filter.vendor =
          req.query.vendor;
      }

      const [
        reviews,
        total,
      ] = await Promise.all([
        Review.find(filter)
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "vendor",
            "name role"
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Review.countDocuments(
          filter
        ),
      ]);

      return res.json({
        success: true,
        reviews,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch reviews",
      });
    }
  };

// =====================================================
// ADMIN MODERATION
// =====================================================

exports.moderateReview =
  async (req, res) => {
    try {
      const {
        status,
        adminNote = "",
      } = req.body;

      const allowedStatuses = [
        "published",
        "hidden",
        "rejected",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid moderation status",
        });
      }

      const review =
        await Review.findById(
          req.params.id
        );

      if (!review) {
        return res.status(404).json({
          success: false,
          message:
            "Review not found",
        });
      }

      const oldStatus =
        review.status;

      review.status = status;
      review.adminNote =
        adminNote.trim();

      review.moderatedBy =
        req.user.id;

      review.moderatedAt =
        new Date();

      await review.save();

      if (
        oldStatus !== status
      ) {
        await updateVendorRating(
          review.vendor
        );
      }

      return res.json({
        success: true,
        message:
          "Review moderated successfully",
        review,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// =====================================================
// ADMIN STATS
// =====================================================

exports.getReviewStats =
  async (req, res) => {
    try {
      const [
        total,
        published,
        pending,
        reported,
        rejected,
        ratingStats,
      ] = await Promise.all([
        Review.countDocuments(),

        Review.countDocuments({
          status: "published",
        }),

        Review.countDocuments({
          status: "pending",
        }),

        Review.countDocuments({
          status: "reported",
        }),

        Review.countDocuments({
          status: "rejected",
        }),

        Review.aggregate([
          {
            $match: {
              status: "published",
            },
          },

          {
            $group: {
              _id: "$rating",
              count: {
                $sum: 1,
              },
            },
          },

          {
            $sort: {
              _id: -1,
            },
          },
        ]),
      ]);

      return res.json({
        success: true,
        stats: {
          total,
          published,
          pending,
          reported,
          rejected,
          ratingStats,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch review stats",
      });
    }
  };