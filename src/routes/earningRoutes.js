const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");
const controller = require("../controllers/earningController");

router.get(
  "/",
  auth,
  controller.getMyEarnings
);

router.get(
  "/summary",
  auth,
  controller.getSummary
);

router.get(
  "/stats",
  auth,
  controller.getStats
);

router.get(
  "/:id",
  auth,
  controller.getEarning
);

router.post(
  "/calculate",
  auth,
  controller.calculate
);

module.exports = router;