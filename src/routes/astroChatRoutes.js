const router = require("express").Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");
const c = require("../controllers/astroChatController");

// ---------------- CUSTOMER ----------------
router.get("/astrologers", auth, role("customer"), c.listAstrologers);
router.post("/sessions", auth, role("customer"), c.requestChat);
router.post("/sessions/:id/cancel", auth, role("customer"), c.cancelRequest);

// ---------------- ASTROLOGER ----------------
router.get("/requests/pending", auth, role("astrologer"), c.pendingRequests);
router.post("/sessions/:id/accept", auth, role("astrologer"), c.acceptChat);
router.post("/sessions/:id/reject", auth, role("astrologer"), c.rejectChat);

// ---------------- ADMIN ----------------
router.get("/admin/astrologers", auth, role("admin"), c.adminListAstrologers);
router.put("/admin/astrologers/:vendorId/pricing", auth, role("admin"), c.adminUpdatePricing);
router.get("/admin/sessions", auth, role("admin"), c.adminListSessions);
router.get("/admin/stats", auth, role("admin"), c.adminStats);

// ---------------- BOTH (customer + astrologer) ----------------
// keep the fixed paths BEFORE "/sessions/:id"
router.get("/sessions/active", auth, role("customer", "astrologer"), c.getActive);
router.get("/sessions/my", auth, role("customer", "astrologer"), c.mySessions);
router.get("/sessions/:id", auth, role("customer", "astrologer"), c.getSession);
router.post("/sessions/:id/end", auth, role("customer", "astrologer"), c.endChat);
router.get("/sessions/:id/messages", auth, role("customer", "astrologer"), c.getMessages);
router.post("/sessions/:id/messages", auth, role("customer", "astrologer"), c.sendMessage);

module.exports = router;
