const router = require("express").Router();
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const c = require("../controllers/dailyPujaController");

router.get("/plans", auth, c.getPlans);
router.get("/pandit/today", auth, role("pandit"), c.panditToday);

router.post("/", auth, role("customer"), c.create);
router.get("/my", auth, role("customer"), c.my);
router.get("/:id", auth, role("customer"), c.getOne);
router.post("/:id/skip", auth, role("customer"), c.skip);
router.put("/:id/cancel", auth, role("customer"), c.cancel);

module.exports = router;
