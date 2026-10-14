const r = require("express").Router();

const c = require("../controllers/astroController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

r.get(
  "/status",
  auth,
  role("astrologer"),
  c.getStatus
);

r.put(
  "/status",
  auth,
  role("astrologer"),
  c.updateStatus
);

r.get(
  "/rates",
  auth,
  role("astrologer"),
  c.getRates
);

r.put(
  "/rates",
  auth,
  role("astrologer"),
  c.updateRates
);

module.exports = r;