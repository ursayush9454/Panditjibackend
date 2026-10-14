/**
 * Puja material e-store - public catalog + customer APIs.
 * Mounted at /api/partner/store
 */
const router = require("express").Router();

const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const rateLimit = require("../middleware/rateLimit");
const c = require("../controllers/storeController");

// ---------- public catalog (login optional) ----------
router.get("/home", c.getHome);
router.get("/categories", c.getCategories);
router.get("/products", c.listProducts);
router.get("/products/:id/reviews", c.getProductReviews);
router.get("/products/:idOrSlug", optionalAuth, c.getProduct);
router.get("/pujas/:pujaId/kit", c.getPujaKit);

// ---------- everything below needs a logged-in user ----------
router.use(auth);

// cart
router.get("/cart", c.getCart);
router.post("/cart/items", c.addToCart);
router.put("/cart/items/:productId", c.updateCartItem);
router.delete("/cart/items/:productId", c.removeCartItem);
router.delete("/cart", c.clearCart);

// wishlist
router.get("/wishlist", c.getWishlist);
router.post("/wishlist/:productId", c.addToWishlist);
router.delete("/wishlist/:productId", c.removeFromWishlist);

// address book
router.get("/addresses", c.listAddresses);
router.post("/addresses", c.createAddress);
router.put("/addresses/:id", c.updateAddress);
router.delete("/addresses/:id", c.deleteAddress);

// coupons
router.get("/coupons", c.listCoupons);
router.post("/coupons/validate", c.validateCoupon);

// checkout
router.post("/checkout/preview", c.checkoutPreview);
router.post(
  "/checkout",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, keyFn: (req) => String(req.user._id), message: "Too many checkout attempts. Please wait a few minutes." }),
  c.checkout
);

// orders
router.get("/orders", c.myOrders);
router.post("/orders/group/:group/pay", c.retryPayment); // before /orders/:id
router.get("/orders/:id", c.myOrder);
router.put("/orders/:id/cancel", c.cancelMyOrder);
router.post("/orders/:id/return", c.requestReturn);
router.post("/orders/:id/reorder", c.reorder);
router.get("/orders/:id/invoice", c.invoice);

// product reviews
router.post("/products/:id/reviews", c.createReview);
router.put("/reviews/:reviewId", c.updateReview);
router.delete("/reviews/:reviewId", c.deleteReview);

module.exports = router;
