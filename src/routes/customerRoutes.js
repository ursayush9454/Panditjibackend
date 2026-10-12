const r = require("express").Router();

const c = require("../controllers/customerController");
const auth = require("../middleware/auth");

r.get(
  "/vendors",
  auth,
  c.getVendors
);

r.get(
  "/astrologers/online",
  auth,
  c.getOnlineAstrologers
);

r.get(
  "/vendors/:role",
  auth,
  c.getVendorsByRole
);

module.exports = r;