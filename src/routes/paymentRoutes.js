const router = require("express").Router();
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const c = require("../controllers/paymentController");

// Razorpay -> server (no auth header, signature protected)
router.post("/webhook", c.webhook);

router.post("/orders", auth, c.createOrder);
router.post("/verify", auth, c.verify);
router.get("/my", auth, c.myPayments);
router.post("/admin/refund", auth, role("admin"), c.adminRefund);

module.exports = router;
