/**
 * Real-time events for paid astrologer chat.
 *
 * Client -> server (all accept an optional ack callback)
 *   astrochat:send          { sessionId, text }
 *   astrochat:typing        { sessionId }
 *   astrochat:stop-typing   { sessionId }
 *   astrochat:end           { sessionId }
 *
 * Server -> client (delivered to the personal room "user:<id>", no join needed)
 *   astrochat:request       astrologer: a customer wants to chat
 *   astrochat:started       both: astrologer accepted, minute 1 charged
 *   astrochat:rejected      both
 *   astrochat:cancelled     both
 *   astrochat:missed        both: request expired
 *   astrochat:message       both: { message }   (sender receives it too -> dedupe by message.id)
 *   astrochat:typing        other side typing
 *   astrochat:billing       customer: charged / balance, astrologer: earned
 *   astrochat:low-balance   customer: balance below next minute
 *   astrochat:ended         both: { reason, session }
 */
const service = require("../services/astroChatService");

const reply = (callback, payload) => {
  if (typeof callback === "function") callback(payload);
};

const replyError = (callback, error) =>
  reply(callback, { success: false, message: error.message || "Something went wrong" });

const setupAstroChatSocket = (io, socket) => {
  const userId = socket.user.id;

  // clears the "offline since" marker of any running chat of this user
  service.markPresence(userId, true).catch((e) => console.error("AstroChat presence:", e.message));

  socket.on("astrochat:send", async (payload = {}, callback) => {
    try {
      const message = await service.sendMessage({
        sessionId: payload.sessionId,
        userId,
        text: payload.text,
      });

      reply(callback, { success: true, message });
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on("astrochat:typing", (payload = {}) => {
    service
      .sendTyping({ sessionId: payload.sessionId, userId, isTyping: true })
      .catch(() => {});
  });

  socket.on("astrochat:stop-typing", (payload = {}) => {
    service
      .sendTyping({ sessionId: payload.sessionId, userId, isTyping: false })
      .catch(() => {});
  });

  socket.on("astrochat:end", async (payload = {}, callback) => {
    try {
      const session = await service.endChat({ sessionId: payload.sessionId, userId });
      reply(callback, { success: true, session });
    } catch (error) {
      replyError(callback, error);
    }
  });
};

// call when the user has NO sockets left
const handleAstroChatOffline = (userId) => {
  service.markPresence(userId, false).catch((e) => console.error("AstroChat presence:", e.message));
};

module.exports = { setupAstroChatSocket, handleAstroChatOffline };
