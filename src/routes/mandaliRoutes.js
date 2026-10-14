const r = require("express").Router();
const c = require("../controllers/mandaliController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

// CUSTOMER: create and track Bhajan Mandli requests.
r.post("/inquiries", auth, role("customer"), c.createInquiry);
r.get("/my-inquiries", auth, role("customer"), c.getMyInquiries);
r.get("/my-dispatches", auth, role("customer"), c.getMyDispatches);
r.get("/dispatches/:id", auth, role("customer"), c.getMyDispatch);
r.put("/inquiries/:id/accept", auth, role("customer"), c.acceptQuote);
r.put("/inquiries/:id/cancel", auth, role("customer"), c.cancelInquiry);

// MANDALI: only the current offer can be quoted or declined.
r.get("/inquiries", auth, role("mandali"), c.getInquiries);
r.get("/inquiries/:id", auth, role("mandali", "customer"), c.getInquiry);
r.put("/inquiry/:id/respond", auth, role("mandali"), c.respondToInquiry);

module.exports = r;
