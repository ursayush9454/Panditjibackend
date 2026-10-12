const jwt = require("jsonwebtoken");
const User = require("../models/User");
module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Auth required"));
      const p = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = await User.findById(p.id);
      if (!socket.user) return next(new Error("User not found"));
      next();
    } catch (e) {
      next(new Error("Invalid token"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.user._id}`);
    socket.on("vendor:online", (online) =>
      socket.broadcast.emit("vendor:online", {
        userId: String(socket.user._id),
        online: !!online,
      }),
    );
    socket.on("vendor:location", (data) => (socket.data.location = data));
    socket.on("job:accept", (data) => io.emit("job:taken", data));
    socket.on("job:decline", (data) => socket.emit("job:declined", data));
    socket.on("chat:message", (data) => {
      if (data?.to)
        io.to(`user:${data.to}`).emit("chat:message", {
          from: String(socket.user._id),
          ...data,
        });
    });
    socket.on("disconnect", () => {});
  });
};
