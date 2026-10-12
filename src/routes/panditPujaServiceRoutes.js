const express = require("express");

const router =
  express.Router();

const auth =
  require("../middleware/auth");

const role =
  require("../middleware/role");

const controller =
  require("../controllers/panditPujaServiceController");

// ======================================================
// PANDIT
// ======================================================

router.get(
  "/pandit/my",
  auth,
  role("pandit"),
  controller.getMyServices
);

router.post(
  "/pandit",
  auth,
  role("pandit"),
  controller.createService
);

router.put(
  "/pandit/:id/toggle",
  auth,
  role("pandit"),
  controller.toggleService
);

router.put(
  "/pandit/:id",
  auth,
  role("pandit"),
  controller.updateService
);

router.delete(
  "/pandit/:id",
  auth,
  role("pandit"),
  controller.deleteService
);

// ======================================================
// ADMIN
// ======================================================

router.get(
  "/admin/all",
  auth,
  role("admin"),
  controller.adminGetServices
);

router.put(
  "/admin/:id/approval",
  auth,
  role("admin"),
  controller.adminUpdateApproval
);

router.delete(
  "/admin/:id",
  auth,
  role("admin"),
  controller.adminDeleteService
);

// ======================================================
// CUSTOMER
// ======================================================

router.get(
  "/",
  auth,
  controller.getPanditServices
);

router.get(
  "/:id",
  auth,
  controller.getService
);

module.exports = router;    