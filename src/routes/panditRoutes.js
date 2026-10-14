const r = require("express").Router();

const c = require("../controllers/panditController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

// =====================================
// PANDIT SLOT MANAGEMENT
// =====================================

r.post(
  "/slots",
  auth,
  role("pandit"),
  c.createSlot
);

r.get(
  "/slots",
  auth,
  role("pandit"),
  c.getSlots
);

r.put(
  "/slots/:id/block",
  auth,
  role("pandit"),
  c.blockSlot
);

r.put(
  "/slots/:id/unblock",
  auth,
  role("pandit"),
  c.unblockSlot
);

r.delete(
  "/slots/:id",
  auth,
  role("pandit"),
  c.deleteSlot
);

// =====================================
// CUSTOMER BOOKING
// =====================================

r.post(
  "/slots/book",
  auth,
  role("customer"),
  c.bookSlot
);

r.put(
  "/slots/cancel",
  auth,
  role("customer"),
  c.cancelBooking
);

module.exports = r;