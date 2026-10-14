const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");
const requirePhone = require("../middleware/requirePhone");
const role = require("../middleware/role");
const controller = require("../controllers/consultationController");

// ==========================================
// CUSTOMER
// ==========================================

router.post(
  "/",
  auth,
  role("customer"),
  requirePhone,
  controller.createConsultation
);

router.get(
  "/my",
  auth,
  controller.getMyConsultations
);

// ==========================================
// ADMIN
// ==========================================

router.get(
  "/admin/all",
  auth,
  role("admin"),
  controller.getAllConsultations
);

router.get(
  "/admin/stats",
  auth,
  role("admin"),
  controller.getConsultationStats
);

// ==========================================
// SINGLE CONSULTATION
// ==========================================

router.get(
  "/:id",
  auth,
  controller.getConsultation
);

// ==========================================
// VENDOR / ASTROLOGER
// ==========================================

router.put(
  "/:id/accept",
  auth,
  controller.acceptConsultation
);

router.put(
  "/:id/reject",
  auth,
  controller.rejectConsultation
);

// ==========================================
// SESSION
// ==========================================

router.post(
  "/:id/session",
  auth,
  controller.createSession
);

router.put(
  "/:id/session/start",
  auth,
  controller.startSession
);

router.get(
  "/:id/session",
  auth,
  controller.getSession
);

// ==========================================
// LIVE SESSION
// ==========================================

router.put(
  "/:id/heartbeat",
  auth,
  controller.heartbeat
);

router.put(
  "/:id/disconnect",
  auth,
  controller.disconnect
);

router.put(
  "/:id/network-quality",
  auth,
  controller.updateNetworkQuality
);

router.put(
  "/:id/end",
  auth,
  controller.endSession
);

module.exports = router;