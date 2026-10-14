const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");
const requirePhone = require("../middleware/requirePhone");

const controller =
  require("../controllers/bookingController");

// ======================================================
// CUSTOMER
// ======================================================

router.post(
  "/",
  auth,
  role("customer"),
  requirePhone,
  controller.createBooking
);

router.get(
  "/my",
  auth,
  role("customer"),
  controller.getMyBookings
);

// ======================================================
// VENDOR
// ======================================================

router.get(
  "/vendor",
  auth,
  controller.getVendorBookings
);

// ======================================================
// ADMIN
// ======================================================

router.get(
  "/admin/all",
  auth,
  role("admin"),
  controller.getAllBookings
);

router.get(
  "/admin/stats",
  auth,
  role("admin"),
  controller.getBookingStats
);

router.put(
  "/admin/:id/status",
  auth,
  role("admin"),
  controller.adminUpdateStatus
);

// ======================================================
// SINGLE BOOKING
// ======================================================

router.get(
  "/:id",
  auth,
  controller.getBooking
);

// ======================================================
// BOOKING ACTIONS
// ======================================================

router.put(
  "/:id/confirm",
  auth,
  controller.confirmBooking
);

router.put(
  "/:id/reject",
  auth,
  controller.rejectBooking
);

router.put(
  "/:id/cancel",
  auth,
  controller.cancelBooking
);

router.put(
  "/:id/reschedule",
  auth,
  controller.rescheduleBooking
);

router.put(
  "/:id/start",
  auth,
  controller.startBooking
);

router.put(
  "/:id/complete",
  auth,
  controller.completeBooking
);

router.put(
  "/:id/no-show",
  auth,
  controller.markNoShow
);

// ======================================================
// SERVICE OTP
// ======================================================

router.post(
  "/:id/service-otp",
  auth,
  controller.generateServiceOtp
);

router.put(
  "/:id/verify-service-otp",
  auth,
  controller.verifyServiceOtp
);

// ======================================================
// PAYMENT
// ======================================================

router.put(
  "/:id/payment",
  auth,
  controller.updatePayment
);

module.exports = router;