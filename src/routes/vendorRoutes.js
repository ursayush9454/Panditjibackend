const r = require("express").Router();

const c = require("../controllers/vendorController");
const auth = require("../middleware/auth");

r.post("/register", auth, c.register);

r.get("/profile", auth, c.getProfile);

r.put("/profile", auth, c.updateProfile);

r.get("/status", auth, c.getVendorStatus);

module.exports = r;