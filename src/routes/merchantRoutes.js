const r = require("express").Router();

const c = require("../controllers/merchantController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

// =====================================
// PRODUCTS
// =====================================

r.post(
  "/products",
  auth,
  role("merchant"),
  c.createProduct
);

r.get(
  "/products",
  auth,
  role("merchant"),
  c.getProducts
);

r.put(
  "/products/:id",
  auth,
  role("merchant"),
  c.updateProduct
);

r.delete(
  "/products/:id",
  auth,
  role("merchant"),
  c.deleteProduct
);

// =====================================
// ORDERS
// =====================================

r.get(
  "/orders",
  auth,
  role("merchant"),
  c.getOrders
);

r.put(
  "/orders/:id/status",
  auth,
  role("merchant"),
  c.updateOrderStatus
);

r.post(
  "/order/advance",
  auth,
  role("merchant"),
  c.updateOrderAdvance
);

module.exports = r;