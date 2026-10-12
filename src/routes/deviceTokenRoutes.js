const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const controller = require("../controllers/deviceTokenController");

router.use(auth);

router.post("/register", controller.registerDeviceToken);
router.get("/", controller.getMyDeviceTokens);
router.post("/deactivate", controller.deactivateDeviceToken);
router.post("/deactivate-all", controller.deactivateAllDeviceTokens);

module.exports = router;