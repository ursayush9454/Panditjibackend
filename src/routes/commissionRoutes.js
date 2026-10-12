const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");

// GET commission module status
router.get("/health", auth, (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Commission module route is available",
  });
});

// Commission business logic will be connected here
router.get("/", auth, role("admin"), (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Commission module is ready for implementation",
    data: [],
  });
});

module.exports = router;