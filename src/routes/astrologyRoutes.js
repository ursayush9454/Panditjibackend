const router = require("express").Router();

const controller = require("../controllers/astrologyController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const upload = require("../utils/imageUpload");

// Birth profiles
router.post(
  "/birth-profiles",
  auth,
  upload.single("photo"),
  controller.createBirthProfile
);

router.get(
  "/birth-profiles",
  auth,
  controller.getBirthProfiles
);

router.get(
  "/birth-profiles/:id",
  auth,
  controller.getBirthProfile
);

router.put(
  "/birth-profiles/:id",
  auth,
  upload.single("photo"),
  controller.updateBirthProfile
);

router.delete(
  "/birth-profiles/:id",
  auth,
  controller.deleteBirthProfile
);

router.put(
  "/birth-profiles/:id/default",
  auth,
  controller.setDefaultProfile
);

// Kundli generation
router.post(
  "/kundli/generate",
  auth,
  controller.generateKundli
);

router.get(
  "/kundli",
  auth,
  controller.getMyKundlis
);

// Horoscope
router.get(
  "/horoscope",
  auth,
  controller.getHoroscope
);

router.post(
  "/horoscope/publish",
  auth,
  role("admin"),
  controller.publishHoroscope
);

// Kundli matching
router.post(
  "/kundli/matching",
  auth,
  controller.matchKundli
);

router.get(
  "/kundli/matching",
  auth,
  controller.getMyKundliMatches
);

// Keep ID routes after static routes
router.get(
  "/kundli/:id",
  auth,
  controller.getKundli
);

router.post(
  "/kundli/:id/regenerate",
  auth,
  controller.regenerateKundli
);

module.exports = router;