
const router = require("express").Router();

const auth = require("../middleware/auth");
const controller = require("../controllers/kundliMatchingController");

// Authenticated user can match two kundlis
router.post("/", auth, controller.createKundliMatch);

module.exports = router;
