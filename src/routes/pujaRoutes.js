const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");

const controller =
  require("../controllers/pujaController");

// ======================================================
// CUSTOMER
// ======================================================

router.get(
  "/",
  auth,
  controller.getPujas
);

router.get(
  "/:id",
  auth,
  controller.getPuja
);

// ======================================================
// ADMIN
// ======================================================

router.post(
  "/admin/create",
  auth,
  role("admin"),
  controller.createPuja
);

router.put(
  "/admin/:id",
  auth,
  role("admin"),
  controller.updatePuja
);

router.put(
  "/admin/:id/samagri",
  auth,
  role("admin"),
  controller.updatePujaSamagri
);

router.delete(
  "/admin/:id",
  auth,
  role("admin"),
  controller.deletePuja
);

module.exports = router;