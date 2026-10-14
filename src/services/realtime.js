// Tiny holder so services can emit socket events without importing server.js
let io = null;
module.exports = {
  setIO: (instance) => {
    io = instance;
  },
  emitToUser: (userId, event, payload) => {
    if (!io || !userId) return;
    io.to(`user:${userId}`).emit(event, payload);
  },
};
