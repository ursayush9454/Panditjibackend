const mongoose = require("mongoose");

const Consultation = require("../models/Consultation");
const Vendor = require("../models/Vendor");

const {
  setConsultationParticipant,
  getConsultation,
  removeConsultationParticipant,
} = require("./socketStore");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getUserRoleForConsultation = async (
  userId,
  consultation
) => {
  if (
    String(consultation.customer) ===
    String(userId)
  ) {
    return "customer";
  }

  const vendor = await Vendor.findOne({
    _id: consultation.vendor,
    user: userId,
  }).select("_id user role");

  if (vendor) {
    return vendor.role;
  }

  return null;
};

const setupWebRTC = (io, socket) => {
  // =====================================================
  // JOIN WEBRTC ROOM
  // =====================================================

  socket.on(
    "webrtc:join",
    async (payload = {}, callback) => {
      try {
        const {
          consultationId,
        } = payload;

        if (
          !consultationId ||
          !isValidObjectId(
            consultationId
          )
        ) {
          throw new Error(
            "Valid consultationId is required"
          );
        }

        const consultation =
          await Consultation.findById(
            consultationId
          ).select(
            "customer vendor status serviceType sessionId roomId"
          );

        if (!consultation) {
          throw new Error(
            "Consultation not found"
          );
        }

        const role =
          await getUserRoleForConsultation(
            socket.user.id,
            consultation
          );

        if (!role) {
          throw new Error(
            "You are not authorized for this consultation"
          );
        }

        if (
          ![
            "accepted",
            "waiting",
            "active",
          ].includes(
            consultation.status
          )
        ) {
          throw new Error(
            "Consultation is not ready for WebRTC"
          );
        }

        const roomName =
          `consultation:${consultationId}`;

        socket.join(roomName);

        setConsultationParticipant(
          consultationId,
          role,
          socket.id
        );

        socket.data.consultationId =
          String(consultationId);

        socket.data.consultationRole =
          role;

        const room =
          getConsultation(
            consultationId
          );

        const participants = [];

        if (room?.customer) {
          participants.push(
            "customer"
          );
        }

        if (room?.vendor) {
          participants.push(
            "vendor"
          );
        }

        socket.to(roomName).emit(
          "webrtc:peer-joined",
          {
            consultationId,
            role,
            userId: socket.user.id,
          }
        );

        socket.emit(
          "webrtc:joined",
          {
            success: true,
            consultationId,
            role,
            sessionId:
              consultation.sessionId,
            roomId:
              consultation.roomId,
            participants,
          }
        );

        if (typeof callback === "function") {
          callback({
            success: true,
            role,
            participants,
          });
        }
      } catch (error) {
        console.error(
          "WebRTC join error:",
          error
        );

        socket.emit(
          "webrtc:error",
          {
            message: error.message,
          }
        );

        if (typeof callback === "function") {
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
  // OFFER
  // =====================================================

  socket.on(
    "webrtc:offer",
    async (payload = {}) => {
      try {
        const {
          consultationId,
          offer,
        } = payload;

        if (
          !consultationId ||
          !offer
        ) {
          return socket.emit(
            "webrtc:error",
            {
              message:
                "consultationId and offer are required",
            }
          );
        }

        const roomName =
          `consultation:${consultationId}`;

        const room =
          getConsultation(
            consultationId
          );

        if (!room) {
          return socket.emit(
            "webrtc:error",
            {
              message:
                "WebRTC room not found",
            }
          );
        }

        socket.to(roomName).emit(
          "webrtc:offer",
          {
            consultationId,
            offer,
            from: {
              userId:
                socket.user.id,
              role:
                socket.data
                  .consultationRole,
            },
          }
        );
      } catch (error) {
        socket.emit(
          "webrtc:error",
          {
            message: error.message,
          }
        );
      }
    }
  );

  // =====================================================
  // ANSWER
  // =====================================================

  socket.on(
    "webrtc:answer",
    async (payload = {}) => {
      try {
        const {
          consultationId,
          answer,
        } = payload;

        if (
          !consultationId ||
          !answer
        ) {
          return socket.emit(
            "webrtc:error",
            {
              message:
                "consultationId and answer are required",
            }
          );
        }

        const roomName =
          `consultation:${consultationId}`;

        socket.to(roomName).emit(
          "webrtc:answer",
          {
            consultationId,
            answer,
            from: {
              userId:
                socket.user.id,
              role:
                socket.data
                  .consultationRole,
            },
          }
        );
      } catch (error) {
        socket.emit(
          "webrtc:error",
          {
            message: error.message,
          }
        );
      }
    }
  );

  // =====================================================
  // ICE CANDIDATE
  // =====================================================

  socket.on(
    "webrtc:ice-candidate",
    async (payload = {}) => {
      try {
        const {
          consultationId,
          candidate,
        } = payload;

        if (
          !consultationId ||
          !candidate
        ) {
          return socket.emit(
            "webrtc:error",
            {
              message:
                "consultationId and candidate are required",
            }
          );
        }

        const roomName =
          `consultation:${consultationId}`;

        socket.to(roomName).emit(
          "webrtc:ice-candidate",
          {
            consultationId,
            candidate,
            from: {
              userId:
                socket.user.id,
              role:
                socket.data
                  .consultationRole,
            },
          }
        );
      } catch (error) {
        socket.emit(
          "webrtc:error",
          {
            message: error.message,
          }
        );
      }
    }
  );

  // =====================================================
  // MEDIA STATE
  // =====================================================

  socket.on(
    "webrtc:media-state",
    (payload = {}) => {
      const {
        consultationId,
        audioEnabled,
        videoEnabled,
      } = payload;

      if (!consultationId) {
        return;
      }

      const roomName =
        `consultation:${consultationId}`;

      socket.to(roomName).emit(
        "webrtc:media-state",
        {
          consultationId,
          userId:
            socket.user.id,
          role:
            socket.data
              .consultationRole,
          audioEnabled:
            Boolean(audioEnabled),
          videoEnabled:
            Boolean(videoEnabled),
        }
      );
    }
  );

  // =====================================================
  // CALL RECONNECT
  // =====================================================

  socket.on(
    "webrtc:reconnect",
    (payload = {}) => {
      const {
        consultationId,
      } = payload;

      if (!consultationId) {
        return;
      }

      const roomName =
        `consultation:${consultationId}`;

      socket.to(roomName).emit(
        "webrtc:peer-reconnecting",
        {
          consultationId,
          userId:
            socket.user.id,
          role:
            socket.data
              .consultationRole,
        }
      );
    }
  );

  // =====================================================
  // CALL END SIGNAL
  // =====================================================

  socket.on(
    "webrtc:end",
    (payload = {}) => {
      const {
        consultationId,
        reason = "other",
      } = payload;

      if (!consultationId) {
        return;
      }

      const roomName =
        `consultation:${consultationId}`;

      socket.to(roomName).emit(
        "webrtc:ended",
        {
          consultationId,
          reason,
          userId:
            socket.user.id,
          role:
            socket.data
              .consultationRole,
        }
      );
    }
  );
};

const handleWebRTCDisconnect = (
  socket
) => {
  const consultationId =
    socket.data?.consultationId;

  if (!consultationId) {
    return;
  }

  removeConsultationParticipant(
    consultationId,
    socket.id
  );

  socket.to(
    `consultation:${consultationId}`
  ).emit(
    "webrtc:peer-left",
    {
      consultationId,
      userId:
        socket.user?.id,
      role:
        socket.data
          ?.consultationRole,
    }
  );
};

module.exports = {
  setupWebRTC,
  handleWebRTCDisconnect,
};