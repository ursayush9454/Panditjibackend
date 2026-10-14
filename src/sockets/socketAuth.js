const jwt = require("jsonwebtoken");

const socketAuth = (socket, next) => {
  try {
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization;

    if (!token) {
      return next(
        new Error("Authentication required")
      );
    }

    if (token.startsWith("Bearer ")) {
      token = token.substring(7);
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (!decoded?.id) {
      return next(
        new Error("Invalid authentication token")
      );
    }

    socket.user = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    console.error(
      "Socket authentication error:",
      error.message
    );

    next(
      new Error("Invalid or expired token")
    );
  }
};

module.exports = socketAuth;