const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");

const profileController = require("../controllers/profileController");


// ========================================
// MY PROFILE
// ========================================

router.get(
  "/me",
  auth,
  profileController.getMyProfile
);

router.put(
  "/me",
  auth,
  profileController.updateMyProfile
);


// ========================================
// VENDOR PROFILE
// ========================================

router.put(
  "/vendor",
  auth,
  profileController.updateVendorProfile
);

router.put(
  "/vendor/online-status",
  auth,
  profileController.updateOnlineStatus
);


// ========================================
// PUBLIC VENDOR PROFILE
// ========================================

router.get(
  "/vendor/:id",
  profileController.getPublicVendorProfile
);


// ========================================
// ACCOUNT CONTACT
// ========================================

router.put(
  "/change-email",
  auth,
  profileController.changeEmail
);

router.put(
  "/change-phone",
  auth,
  profileController.changePhone
);


// ========================================
// ACCOUNT MANAGEMENT
// ========================================

router.put(
  "/deactivate",
  auth,
  profileController.deactivateAccount
);

router.put(
  "/reactivate",
  auth,
  profileController.reactivateAccount
);

router.delete(
  "/delete",
  auth,
  profileController.deleteAccount
);


module.exports = router;