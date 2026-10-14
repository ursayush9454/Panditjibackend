const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");
const controller = require("../controllers/notificationController");

// User notification endpoints
router.get("/", auth, controller.getNotifications);
router.get("/unread-count", auth, controller.getUnreadCount);
router.put("/read-all", auth, controller.markAllAsRead);
router.delete("/read-all", auth, controller.deleteAllRead);

// Admin-only endpoints
router.post("/admin/send", auth, role("admin"), controller.adminSendNotification);
router.post("/admin/broadcast", auth, role("admin"), controller.adminBroadcastNotification);

// Single notification endpoints — keep after static routes
router.get("/:id", auth, controller.getNotification);
router.put("/:id/read", auth, controller.markAsRead);
router.delete("/:id", auth, controller.deleteNotification);

module.exports = router;