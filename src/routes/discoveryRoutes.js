const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");

const discoveryController =
  require("../controllers/discoveryController");


// ==================================================
// ALL VENDORS DISCOVERY
// ==================================================

router.get(
  "/vendors",
  auth,
  discoveryController.discoverVendors
);


// ==================================================
// TOP ASTROLOGERS
// ==================================================

router.get(
  "/astrologers/top",
  auth,
  discoveryController.getTopAstrologers
);


// ==================================================
// ONLINE ASTROLOGERS
// ==================================================

router.get(
  "/astrologers/online",
  auth,
  discoveryController.getOnlineAstrologers
);


// ==================================================
// VENDORS BY ROLE
// ==================================================

router.get(
  "/role/:role",
  auth,
  discoveryController.getVendorsByRole
);


// ==================================================
// DISCOVERY STATS
// ==================================================

router.get(
  "/stats",
  auth,
  discoveryController.getDiscoveryStats
);


// ==================================================
// SINGLE VENDOR
// ==================================================

router.get(
  "/vendors/:id",
  auth,
  discoveryController.getVendorDetails
);


module.exports = router;