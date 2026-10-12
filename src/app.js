const express = require("express");
const cors = require("cors");
const path = require("path");

const rateLimit = require("./middleware/rateLimit");

const app = express();

// behind Nginx / a load balancer so req.ip is the real client IP
app.set("trust proxy", 1);

// =====================================================
// GLOBAL MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    credentials: true,
  })
);

// rawBody is needed to verify Razorpay webhook signatures
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// =====================================================
// STATIC UPLOADS
// =====================================================

app.use(
  "/uploads",
  express.static(
    path.join(
      process.cwd(),
      process.env.UPLOAD_DIR || "uploads"
    )
  )
);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Vaidic Sanskar API is running",
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// PARTNER ROUTES
// =====================================================

// =====================================================
// AUTH
// =====================================================

app.use(
  "/api/partner/auth",
  require("./routes/authRoutes")
);

// =====================================================
// VENDOR
// =====================================================

app.use(
  "/api/partner/vendor",
  require("./routes/vendorRoutes")
);

// =====================================================
// JOBS
// =====================================================

app.use(
  "/api/partner/job",
  require("./routes/jobRoutes")
);

// =====================================================
// PANDIT
// =====================================================

app.use(
  "/api/partner/pandit",
  require("./routes/panditRoutes")
);

// =====================================================
// MERCHANT
// =====================================================

app.use(
  "/api/partner/merchant",
  require("./routes/merchantRoutes")
);

// =====================================================
// MANDALI
// =====================================================

app.use(
  "/api/partner/mandali",
  require("./routes/mandaliRoutes")
);

// =====================================================
// MANDALI PORTFOLIO
// =====================================================

app.use(
  "/api/partner/mandali/portfolio",
  require("./routes/portfolioRoutes")
);

// =====================================================
// ASTROLOGER
// =====================================================

app.use(
  "/api/partner/astro",
  require("./routes/astroRoutes")
);

// =====================================================
// CUSTOMER / DISCOVERY
// =====================================================

app.use(
  "/api/partner/customer",
  require("./routes/customerRoutes")
);

// =====================================================
// NOTIFICATIONS
// =====================================================

app.use(
  "/api/partner/notifications",
  require("./routes/notificationRoutes")
);

// =====================================================
// CHAT SYSTEM
// =====================================================

app.use(
  "/api/partner/chat",
  require("./routes/chatRoutes")
);

// =====================================================
// CONSULTATION
// =====================================================

app.use(
  "/api/partner/consultation",
  require("./routes/consultationRoutes")
);

// =====================================================
// BOOKINGS
// =====================================================

app.use(
  "/api/partner/bookings",
  require("./routes/bookingRoutes")
);

// =====================================================
// ASTROLOGY / KUNDLI
// =====================================================

app.use(
  "/api/partner/astrology",
  require("./routes/astrologyRoutes")
);

// =====================================================
// WALLET
// =====================================================

app.use(
  "/api/partner/wallet",
  require("./routes/walletRoutes")
);

// =====================================================
// EARNINGS
// =====================================================

app.use(
  "/api/partner/earnings",
  require("./routes/earningRoutes")
);

// =====================================================
// COMMISSION
// =====================================================

app.use(
  "/api/partner/commission",
  require("./routes/commissionRoutes")
);

// =====================================================
// REVIEWS
// =====================================================

app.use(
  "/api/partner/reviews",
  require("./routes/reviewRoutes")
);

// =====================================================
// ADMIN
// =====================================================

app.use(
  "/api/partner/admin",
  require("./routes/adminRoutes")
);

// =====================================================
// ORDERS
// =====================================================

app.use(
  "/api/partner/orders",
  require("./routes/orderRoutes")
);

// =====================================================
// FILE UPLOADS
// =====================================================

app.use(
  "/api/partner/uploads",
  require("./routes/uploadRoutes")
);

//=====================================================
//                  Profile 
//=====================================================
app.use(
  "/api/partner/profile",
  require("./routes/profileRoutes")
);


app.use(
  "/api/partner/discovery",
  require("./routes/discoveryRoutes")
);

app.use(
  "/api/partner/pujas",
  require("./routes/pujaRoutes")
);
app.use(
  "/api/partner/pandit/puja-services",
  require("./routes/panditPujaServiceRoutes")
);

app.use(
  "/api/partner/bookings",
  require("./routes/bookingRoutes")
);

app.use(
  "/api/partner/kundli-matching",
  require("./routes/kundliMatchingRoutes")
);
const notificationRoutes = require("./routes/notificationRoutes");
const deviceTokenRoutes = require("./routes/deviceTokenRoutes");

// Add these alongside your existing API route mounts.
app.use("/api/partner/notifications", notificationRoutes);
app.use("/api/partner/device-tokens", deviceTokenRoutes);


// =====================================================
// INSTANT BOOKING (Uber / Rapido style dispatch)
// =====================================================

app.use(
  "/api/partner/instant",
  require("./routes/instantRoutes")
);

// =====================================================
// PAYMENTS (Razorpay)
// =====================================================

app.use(
  "/api/partner/payments",
  require("./routes/paymentRoutes")
);

// =====================================================
// DAILY PUJA SUBSCRIPTIONS
// =====================================================

app.use(
  "/api/partner/daily-puja",
  require("./routes/dailyPujaRoutes")
);

// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
    path: req.originalUrl,
  });
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  console.error("Global Error:", err);

  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Server error",
  });
});

// =====================================================
// EXPORT
// =====================================================

module.exports = app;