const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");

const adminController = require("../controllers/adminController");

// Dashboard
router.get(
  "/dashboard",
  auth,
  role("admin"),
  adminController.getDashboard
);

// Users
router.get(
  "/users",
  auth,
  role("admin"),
  adminController.getUsers
);

router.get(
  "/users/:id",
  auth,
  role("admin"),
  adminController.getUser
);

router.put(
  "/users/:id/status",
  auth,
  role("admin"),
  adminController.updateUserStatus
);

router.delete(
  "/users/:id",
  auth,
  role("admin"),
  adminController.deleteUser
);

// Vendors
router.get(
  "/vendors",
  auth,
  role("admin"),
  adminController.getVendors
);

router.get(
  "/vendors/:id",
  auth,
  role("admin"),
  adminController.getVendor
);

router.put(
  "/vendors/:id/status",
  auth,
  role("admin"),
  adminController.updateVendorStatus
);

router.put(
  "/vendors/:id/online-status",
  auth,
  role("admin"),
  adminController.updateVendorOnlineStatus
);

// Bookings
router.get(
  "/bookings",
  auth,
  role("admin"),
  adminController.getBookings
);

// Consultations
router.get(
  "/consultations",
  auth,
  role("admin"),
  adminController.getConsultations
);

// Wallet
router.get(
  "/wallet",
  auth,
  role("admin"),
  adminController.getWalletOverview
);

// Earnings
router.get(
  "/earnings",
  auth,
  role("admin"),
  adminController.getEarningsOverview
);

// Notifications
router.post(
  "/notifications",
  auth,
  role("admin"),
  adminController.sendNotification
);

// Reports
router.get(
  "/reports",
  auth,
  role("admin"),
  adminController.getReports
);

// Recent activity
router.get(
  "/activity",
  auth,
  role("admin"),
  adminController.getRecentActivity
);

// Instant Puja dispatch settings
router.get(
  "/instant-dispatch-settings",
  auth,
  role("admin"),
  adminController.getInstantDispatchSettings
);

router.put(
  "/instant-dispatch-settings",
  auth,
  role("admin"),
  adminController.updateInstantDispatchSettings
);

// Enable/disable a Pandit for instant booking and change priority
router.put(
  "/instant-dispatch/vendors/:id",
  auth,
  role("admin"),
  adminController.updateInstantDispatchVendor
);

module.exports = router;