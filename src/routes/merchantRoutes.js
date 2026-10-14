const r = require("express").Router();

const c = require("../controllers/merchantController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

r.use(auth, role("merchant"));

// =====================================
// DASHBOARD
// =====================================
r.get("/dashboard", c.getDashboard);

// =====================================
// PRODUCTS
// =====================================
r.post("/products", c.createProduct);
r.get("/products", c.getProducts);
r.put("/products/stock", c.bulkUpdateStock); // before /products/:id
r.get("/products/:id", c.getProduct);
r.put("/products/:id", c.updateProduct);
r.delete("/products/:id", c.deleteProduct);

// =====================================
// ORDERS
// =====================================
r.get("/orders", c.getOrders);
r.get("/orders/:id", c.getOrder);
r.put("/orders/:id/status", c.updateOrderStatus);
r.post("/order/advance", c.updateOrderAdvance);

module.exports = r;
