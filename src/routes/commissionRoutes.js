const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");
const commissionController = require("../controllers/commissionController");

// GET commission module status
router.get("/health", auth, (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Commission module route is available",
  });
});

// Admin: global commission per service type (chat, audio, video, pandit, merchant, ...)
// e.g. PUT /api/partner/commission/chat  { "percentage": 50 }
router.get("/", auth, role("admin"), commissionController.getAll);
router.get("/:serviceType", auth, role("admin"), commissionController.getOne);
router.put("/:serviceType", auth, role("admin"), commissionController.upsert);
router.delete("/:serviceType", auth, role("admin"), commissionController.disable);

module.exports = router;