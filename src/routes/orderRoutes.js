const r = require("express").Router();

const c = require("../controllers/orderController");
const auth = require("../middleware/auth");

// Create customer order
r.post(
  "/",
  auth,
  c.createOrder
);

// Get my orders
r.get(
  "/my",
  auth,
  c.getMyOrders
);

// Get single order
r.get(
  "/my/:id",
  auth,
  c.getMyOrder
);

// Cancel order
r.put(
  "/my/:id/cancel",
  auth,
  c.cancelOrder
);

module.exports = r;