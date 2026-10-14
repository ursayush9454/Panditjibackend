const mongoose = require("mongoose");

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const isParticipant = (
  conversation,
  userId
) => {
  return conversation.participants.some(
    (participant) =>
      String(
        participant
      ) === String(userId)
  );
};

const setupChatSocket = (
  io,
  socket
) => {
  // =====================================================
  // JOIN CONVERSATION
  // =====================================================

  socket.on(
    "chat:join",
    async (
      payload = {},
      callback
    ) => {
      try {
        const {
          conversationId,
        } = payload;

        if (
          !conversationId ||
          !isValidObjectId(
            conversationId
          )
        ) {
          throw new Error(
            "Valid conversationId is required"
          );
        }

        const conversation =
          await Conversation.findById(
            conversationId
          );

        if (!conversation) {
          throw new Error(
            "Conversation not found"
          );
        }

        if (
          !isParticipant(
            conversation,
            socket.user.id
          )
        ) {
          throw new Error(
            "You are not a participant"
          );
        }

        const room =
          `conversation:${conversationId}`;

        socket.join(room);

        socket.data.conversationId =
          String(conversationId);

        socket.emit(
          "chat:joined",
          {
            success: true,
            conversationId,
          }
        );

        socket.to(room).emit(
          "chat:user-online",
          {
            conversationId,
            userId:
              socket.user.id,
          }
        );

        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success: true,
          });
        }
      } catch (error) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success: false,
            message:
              error.message,
          });
        }
      }
    }
  );

  // =====================================================
  // SEND MESSAGE
  // =====================================================

  socket.on(
    "chat:send",
    async (
      payload = {},
      callback
    ) => {
      try {
        const {
          conversationId,
          text = "",
          type = "text",
          fileUrl = "",
          fileName = "",
          metadata = {},
        } = payload;

        if (
          !conversationId ||
          !isValidObjectId(
            conversationId
          )
        ) {
          throw new Error(
            "Valid conversationId is required"
          );
        }

        const conversation =
          await Conversation.findById(
            conversationId
          );

        if (!conversation) {
          throw new Error(
            "Conversation not found"
          );
        }

        if (
          !isParticipant(
            conversation,
            socket.user.id
          )
        ) {
          throw new Error(
            "You are not a participant"
          );
        }

        if (
          ![
            "text",
            "image",
            "file",
          ].includes(type)
        ) {
          throw new Error(
            "Invalid message type"
          );
        }

        if (
          type === "text" &&
          !String(text).trim()
        ) {
          throw new Error(
            "Message text is required"
          );
        }

        const message =
          await Message.create({
            conversation:
              conversationId,
            sender:
              socket.user.id,
            type,
            text:
              String(text).trim(),
            fileUrl,
            fileName,
            metadata,
          });

        await message.populate(
          "sender",
          "name phone role"
        );

        const room =
          `conversation:${conversationId}`;

        io.to(room).emit(
          "chat:message",
          {
            success: true,
            message,
          }
        );

        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success: true,
            message,
          });
        }
      } catch (error) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success: false,
            message:
              error.message,
          });
        }
      }
    }
  );

  // =====================================================
  // TYPING START
  // =====================================================

  socket.on(
    "chat:typing",
    (payload = {}) => {
      const {
        conversationId,
      } = payload;

      if (!conversationId) {
        return;
      }

      socket.to(
        `conversation:${conversationId}`
      ).emit(
        "chat:user-typing",
        {
          conversationId,
          userId:
            socket.user.id,
          isTyping: true,
        }
      );
    }
  );

  // =====================================================
  // TYPING STOP
  // =====================================================

  socket.on(
    "chat:stop-typing",
    (payload = {}) => {
      const {
        conversationId,
      } = payload;

      if (!conversationId) {
        return;
      }

      socket.to(
        `conversation:${conversationId}`
      ).emit(
        "chat:user-typing",
        {
          conversationId,
          userId:
            socket.user.id,
          isTyping: false,
        }
      );
    }
  );

  // =====================================================
  // MESSAGE READ
  // =====================================================

  socket.on(
    "chat:read",
    async (
      payload = {}
    ) => {
      try {
        const {
          conversationId,
          messageId,
        } = payload;

        if (
          !conversationId ||
          !messageId
        ) {
          return;
        }

        const conversation =
          await Conversation.findById(
            conversationId
          );

        if (!conversation) {
          return;
        }

        if (
          !isParticipant(
            conversation,
            socket.user.id
          )
        ) {
          return;
        }

        const message =
          await Message.findById(
            messageId
          );

        if (!message) {
          return;
        }

        if (
          String(
            message.conversation
          ) !==
          String(conversationId)
        ) {
          return;
        }

        if (
          String(message.sender) !==
          String(socket.user.id)
        ) {
          message.readAt =
            new Date();

          await message.save();
        }

        socket.to(
          `conversation:${conversationId}`
        ).emit(
          "chat:message-read",
          {
            conversationId,
            messageId,
            readBy:
              socket.user.id,
            readAt:
              message.readAt,
          }
        );
      } catch (error) {
        console.error(
          "Chat read socket error:",
          error.message
        );
      }
    }
  );

  // =====================================================
  // MESSAGE DELIVERED
  // =====================================================

  socket.on(
    "chat:delivered",
    (payload = {}) => {
      const {
        conversationId,
        messageId,
      } = payload;

      if (
        !conversationId ||
        !messageId
      ) {
        return;
      }

      socket.to(
        `conversation:${conversationId}`
      ).emit(
        "chat:message-delivered",
        {
          conversationId,
          messageId,
          deliveredTo:
            socket.user.id,
          deliveredAt:
            new Date(),
        }
      );
    }
  );

  // =====================================================
  // LEAVE
  // =====================================================

  socket.on(
    "chat:leave",
    (payload = {}) => {
      const {
        conversationId,
      } = payload;

      if (!conversationId) {
        return;
      }

      socket.leave(
        `conversation:${conversationId}`
      );

      socket.to(
        `conversation:${conversationId}`
      ).emit(
        "chat:user-offline",
        {
          conversationId,
          userId:
            socket.user.id,
        }
      );
    }
  );
};

module.exports = setupChatSocket;