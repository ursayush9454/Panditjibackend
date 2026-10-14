
require("dotenv").config();

const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");

const { Server } = require("socket.io");
const setupSocketServer = require("./src/sockets/socketServer");

const {
  startDispatchSweeper,
  stopDispatchSweeper,
} = require("./src/services/dispatchService");

const {
  startDailyPujaScheduler,
} = require("./src/services/dailyPujaService");

const {
  startStoreSweeper,
  stopStoreSweeper,
} = require("./src/services/storeService");

const {
  startDailyHoroscopeJob,
  stopDailyHoroscopeJob,
} = require("./src/jobs/dailyHoroscopeJob");

const {
  startAstroChatSweeper,
  stopAstroChatSweeper,
} = require("./src/services/astroChatService");

const PORT = process.env.PORT || 5000;

// Validate environment configuration
const validateEnv = () => {
  const problems = [];

  if (!process.env.MONGO_URI) {
    problems.push("MONGO_URI is missing");
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32
  ) {
    problems.push("JWT_SECRET must be at least 32 characters");
  }

  if (process.env.NODE_ENV === "production") {
    if (process.env.OTP_DEV_MODE === "true") {
      problems.push("OTP_DEV_MODE must be false in production");
    }

    if (
      !process.env.CLIENT_ORIGIN ||
      process.env.CLIENT_ORIGIN === "*"
    ) {
      problems.push(
        "CLIENT_ORIGIN must be set to your real origin(s) in production"
      );
    }
  }

  if (problems.length > 0) {
    console.error(
      "Unsafe configuration:\n - " + problems.join("\n - ")
    );

    process.exit(1);
  }
};

const startServer = async () => {
  try {
    // Validate environment variables
    validateEnv();

    // Connect MongoDB
    await connectDB();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    const io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_ORIGIN || "*",
        methods: [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
        ],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    // Initialize sockets, chat, notifications and WebRTC
    setupSocketServer(io);

    // Start background workers
    startDispatchSweeper();
    startDailyPujaScheduler();
    startStoreSweeper();

    // Start automatic daily horoscope scheduler
    startDailyHoroscopeJob();

    // Paid astrologer chat: per-minute billing, request expiry, disconnect handling
    await startAstroChatSweeper();

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}`);
      console.log("Socket.IO: enabled");
      console.log("WebRTC signaling: enabled");
    });

    // Graceful shutdown
    let isShuttingDown = false;

    const shutdown = (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`${signal} received. Shutting down...`);

      // Stop background jobs
      stopDispatchSweeper();
      stopStoreSweeper();
      stopDailyHoroscopeJob();
      stopAstroChatSweeper();

      // Close Socket.IO and HTTP server
      io.close(() => {
        console.log("Socket.IO closed");

        server.close(() => {
          console.log("HTTP server closed");
          process.exit(0);
        });
      });
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
