const r = require("express").Router();

const c = require("../controllers/jobController");
const auth = require("../middleware/auth");

// Customer
r.post(
  "/",
  auth,
  c.createJob
);

r.get(
  "/my",
  auth,
  c.getCustomerJobs
);

r.put(
  "/cancel",
  auth,
  c.cancelJob
);

// Vendor
r.get(
  "/vendor",
  auth,
  c.getVendorJobs
);

r.post(
  "/accept",
  auth,
  c.acceptJob
);

r.post(
  "/decline",
  auth,
  c.declineJob
);

r.post(
  "/start",
  auth,
  c.startJob
);

r.post(
  "/complete",
  auth,
  c.completeJob
);

// Common
r.get(
  "/:id",
  auth,
  c.getJob
);

module.exports = r;