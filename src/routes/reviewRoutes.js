const express = require("express");

const router =
  express.Router();

const controller =
  require("../controllers/reviewController");

const auth =
  require("../middleware/auth");

const role =
  require("../middleware/role");

// =====================================================
// CUSTOMER
// =====================================================

router.post(
  "/",
  auth,
  role("customer"),
  controller.createReview
);

router.get(
  "/my",
  auth,
  role("customer"),
  controller.getMyReviews
);

router.put(
  "/:id",
  auth,
  role("customer"),
  controller.updateReview
);

router.delete(
  "/:id",
  auth,
  role("customer"),
  controller.deleteReview
);

router.post(
  "/:id/helpful",
  auth,
  controller.markHelpful
);

router.post(
  "/:id/report",
  auth,
  controller.reportReview
);

// =====================================================
// VENDOR REVIEWS
// =====================================================

router.get(
  "/vendor/:vendorId",
  controller.getVendorReviews
);

// =====================================================
// SINGLE REVIEW
// =====================================================

router.get(
  "/:id",
  controller.getReview
);

// =====================================================
// VENDOR REPLY
// =====================================================

router.post(
  "/:id/reply",
  auth,
  role(
    "astrologer",
    "pandit",
    "merchant",
    "mandali"
  ),
  controller.replyToReview
);

// =====================================================
// ADMIN
// =====================================================

router.get(
  "/admin/all",
  auth,
  role("admin"),
  controller.getAllReviews
);

router.get(
  "/admin/stats",
  auth,
  role("admin"),
  controller.getReviewStats
);

router.put(
  "/admin/:id/moderate",
  auth,
  role("admin"),
  controller.moderateReview
);

module.exports = router;