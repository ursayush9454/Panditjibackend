const router = require("express").Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");

const instant = require("../controllers/instantController");
const reviews = require("../controllers/instantReviewController");

// ---------------- CUSTOMER ----------------

router.get(
  "/nearby-pandits",
  auth,
  role("customer"),
  instant.nearbyPandits
);

router.post(
  "/estimate",
  auth,
  role("customer"),
  instant.estimate
);

router.post(
  "/request",
  auth,
  role("customer"),
  instant.createRequest
);

router.get(
  "/active",
  auth,
  role("customer"),
  instant.getActive
);

router.put(
  "/:id/cancel",
  auth,
  role("customer"),
  instant.cancelRequest
);

// ---------------- PANDIT ----------------

router.put(
  "/pandit/online",
  auth,
  role("pandit"),
  instant.setOnline
);

router.put(
  "/pandit/location",
  auth,
  role("pandit"),
  instant.updateLocation
);

router.get(
  "/pandit/offer",
  auth,
  role("pandit"),
  instant.getOffer
);

router.put(
  "/:id/accept",
  auth,
  role("pandit"),
  instant.acceptRequest
);

router.put(
  "/:id/decline",
  auth,
  role("pandit"),
  instant.declineRequest
);

router.put(
  "/:id/arrived",
  auth,
  role("pandit"),
  instant.markArrived
);

router.put(
  "/:id/start",
  auth,
  role("pandit"),
  instant.startService
);

router.put(
  "/:id/complete",
  auth,
  role("pandit"),
  instant.completeService
);

router.put(
  "/:id/pandit-cancel",
  auth,
  role("pandit"),
  instant.panditCancel
);

// ---------------- MUTUAL REVIEWS ----------------

router.post(
  "/:id/reviews/customer",
  auth,
  role("customer"),
  reviews.submitCustomerReview
);

router.post(
  "/:id/reviews/pandit",
  auth,
  role("pandit"),
  reviews.submitPanditReview
);

router.get(
  "/:id/reviews",
  auth,
  reviews.getRequestReviews
);

// ---------------- SHARED REQUEST DETAILS ----------------

router.get(
  "/:id",
  auth,
  instant.getRequest
);

module.exports = router;