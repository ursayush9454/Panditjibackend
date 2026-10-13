/**
 * E-store admin APIs. Mounted at /api/partner/store/admin
 */
const router = require("express").Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");
const c = require("../controllers/storeAdminController");

router.use(auth, role("admin"));

router.get("/stats", c.getStats);

// categories
router.get("/categories", c.listCategories);
router.post("/categories", c.createCategory);
router.put("/categories/:id", c.updateCategory);
router.delete("/categories/:id", c.deleteCategory);

// coupons
router.get("/coupons", c.listCoupons);
router.post("/coupons", c.createCoupon);
router.put("/coupons/:id", c.updateCoupon);
router.delete("/coupons/:id", c.deleteCoupon);

// products
router.get("/products", c.listProducts);
router.put("/products/:id", c.updateProduct);
router.put("/products/:id/moderate", c.moderateProduct);

// product reviews
router.get("/reviews", c.listReviews);
router.put("/reviews/:id/moderate", c.moderateReview);

// orders
router.get("/orders", c.listOrders);
router.get("/orders/:id", c.getOrder);
router.put("/orders/:id/status", c.forceOrderStatus);
router.put("/orders/:id/cancel", c.cancelOrder);
router.put("/orders/:id/return", c.resolveReturn);
router.post("/orders/:id/retry-refund", c.retryRefund);
router.post("/orders/:id/settle", c.retrySettlement);

module.exports = router;
