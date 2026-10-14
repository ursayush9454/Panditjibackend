const r = require("express").Router();

const c = require("../controllers/portfolioController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

// Portfolio
r.get(
  "/",
  auth,
  role("mandali"),
  c.getPortfolio
);

r.post(
  "/",
  auth,
  role("mandali"),
  c.createPortfolio
);

r.put(
  "/:id",
  auth,
  role("mandali"),
  c.updatePortfolio
);

r.delete(
  "/:id",
  auth,
  role("mandali"),
  c.deletePortfolio
);

module.exports = r;