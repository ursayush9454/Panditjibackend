const socketAuth = require("./socketAuth");

const {
  setNotificationIO,
} = require("../services/notificationService");

const {
  addUserSocket,
  removeUserSocket,
  isUserOnline,
} = require("./socketStore");

const setupChatSocket =
  require("./chatSocket");

const {
  setupAstroChatSocket,
  handleAstroChatOffline,
} = require("./astroChatSocket");

const {
  setupWebRTC,
  handleWebRTCDisconnect,
} = require("./webrtcSocket");

// =====================================================
// SOCKET SERVER
// =====================================================

const setupTrackingSocket = require("./trackingSocket");

const setupSocketServer = (io) => {
  // ===================================================
  // NOTIFICATION SOCKET INSTANCE
  // ===================================================

  setNotificationIO(io);
  require("../services/realtime").setIO(io);

  // ===================================================
  // SOCKET AUTHENTICATION
  // ===================================================

  io.use(socketAuth);

  // ===================================================
  // CONNECTION
  // ===================================================

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    const userRole = socket.user.role;

    console.log(
      `Socket connected: ${socket.id} | User: ${userId} | Role: ${userRole}`
    );

    // =================================================
    // STORE USER SOCKET
    // =================================================

    addUserSocket(
      userId,
      socket.id
    );

    // =================================================
    // PERSONAL USER ROOM
    // =================================================

    socket.join(
      `user:${userId}`
    );

    // =================================================
    // GLOBAL ONLINE EVENT
    // =================================================

    io.emit(
      "presence:online",
      {
        userId,
        role: userRole,
        socketId: socket.id,
      }
    );

    // =================================================
    // SOCKET CONNECTED EVENT
    // =================================================

    socket.emit(
      "socket:connected",
      {
        success: true,
        socketId: socket.id,
        userId,
        role: userRole,
      }
    );

    // =================================================
    // PING / PONG
    // =================================================

    socket.on(
      "ping",
      () => {
        socket.emit(
          "pong",
          {
            success: true,
            timestamp: Date.now(),
          }
        );
      }
    );

    // =================================================
    // PRESENCE HEARTBEAT
    // =================================================

    socket.on(
      "presence:heartbeat",
      () => {
        socket.emit(
          "presence:heartbeat",
          {
            success: true,
            userId,
            timestamp: Date.now(),
          }
        );
      }
    );

    // =================================================
    // CHAT SOCKET
    // =================================================

    setupChatSocket(
      io,
      socket
    );

    // =================================================
    // PAID ASTROLOGER CHAT SOCKET
    // =================================================

    setupAstroChatSocket(
      io,
      socket
    );

    // =================================================
    // WEBRTC SOCKET
    // =================================================

    setupWebRTC(
      io,
      socket
    );

    setupTrackingSocket(io, socket);

    // =================================================
    // DISCONNECT
    // =================================================

    socket.on(
      "disconnect",
      (reason) => {
        console.log(
          `Socket disconnected: ${socket.id} | ${reason}`
        );

        // =============================================
        // WEBRTC CLEANUP
        // =============================================

        handleWebRTCDisconnect(
          socket
        );

        // =============================================
        // REMOVE USER SOCKET
        // =============================================

        removeUserSocket(
          userId,
          socket.id
        );

        // =============================================
        // USER COMPLETELY OFFLINE
        // =============================================

        if (
          !isUserOnline(
            userId
          )
        ) {
          io.emit(
            "presence:offline",
            {
              userId,
              role: userRole,
            }
          );

          // paid astrologer chat: start the disconnect grace timer
          handleAstroChatOffline(
            userId
          );
        }
      }
    );
  });

  console.log(
    "Socket.IO + WebRTC signaling initialized"
  );

  return io;
};

module.exports =
  setupSocketServer;