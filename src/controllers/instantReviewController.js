const mongoose = require("mongoose");
const InstantRequest = require("../models/InstantRequest");
const InstantReview = require("../models/InstantReview");
const Vendor = require("../models/Vendor");

const submitReview = (reviewerRole) => async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rating,
      comment = "",
      categories = {},
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid instant request ID",
      });
    }

    const score = Number(rating);

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer from 1 to 5",
      });
    }

    if (typeof comment !== "string" || comment.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Comment must be 2000 characters or fewer",
      });
    }

    const request = await InstantRequest.findOne({
      _id: id,
      status: "completed",
    });

    if (
      !request ||
      !request.booking ||
      !request.assignedVendor
    ) {
      return res.status(404).json({
        success: false,
        message: "Completed puja request not found",
      });
    }

    const vendor = await Vendor.findById(
      request.assignedVendor
    ).select("user");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    const expectedReviewer =
      reviewerRole === "customer"
        ? String(request.customer)
        : String(vendor.user);

    if (String(req.user._id) !== expectedReviewer) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to submit this review",
      });
    }

    const review = await InstantReview.create({
      request: request._id,
      booking: request.booking,
      customer: request.customer,
      pandit: vendor._id,
      reviewer: req.user._id,
      reviewerRole,
      rating: score,
      comment: comment.trim(),
      categories,
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted your review for this puja",
      });
    }

    console.error("Instant review submission failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit review",
    });
  }
};

exports.submitCustomerReview = submitReview("customer");
exports.submitPanditReview = submitReview("pandit");

exports.getRequestReviews = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    const request = await InstantRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const vendor = request.assignedVendor
      ? await Vendor.findById(request.assignedVendor).select("user")
      : null;

    const isCustomer =
      String(req.user._id) === String(request.customer);

    const isPandit =
      String(req.user._id) === String(vendor?.user);

    const isAdmin = req.user.role === "admin";

    if (!isCustomer && !isPandit && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const reviews = await InstantReview.find({
      request: id,
      status: "published",
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      success: true,
      reviews,
      submitted: {
        customer: reviews.some(
          (review) => review.reviewerRole === "customer"
        ),
        pandit: reviews.some(
          (review) => review.reviewerRole === "pandit"
        ),
      },
    });
  } catch (error) {
    console.error("Get instant reviews failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
    });
  }
};