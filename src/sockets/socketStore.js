const users = new Map();
const consultations = new Map();

/*
users:

userId => Set(socketId)

consultations:

consultationId => {
  customer: socketId,
  vendor: socketId
}
*/

const addUserSocket = (userId, socketId) => {
  const key = String(userId);

  if (!users.has(key)) {
    users.set(key, new Set());
  }

  users.get(key).add(socketId);
};

const removeUserSocket = (
  userId,
  socketId
) => {
  const key = String(userId);

  const sockets = users.get(key);

  if (!sockets) {
    return;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    users.delete(key);
  }
};

const getUserSockets = (userId) => {
  return users.get(String(userId)) || new Set();
};

const isUserOnline = (userId) => {
  return (
    users.has(String(userId)) &&
    users.get(String(userId)).size > 0
  );
};

const setConsultationParticipant = (
  consultationId,
  role,
  socketId
) => {
  const key = String(consultationId);

  if (!consultations.has(key)) {
    consultations.set(key, {});
  }

  const consultation =
    consultations.get(key);

  if (role === "customer") {
    consultation.customer = socketId;
  }

  if (
    role === "astrologer" ||
    role === "pandit" ||
    role === "merchant" ||
    role === "mandali"
  ) {
    consultation.vendor = socketId;
  }
};

const getConsultation = (
  consultationId
) => {
  return (
    consultations.get(
      String(consultationId)
    ) || null
  );
};

const removeConsultationParticipant = (
  consultationId,
  socketId
) => {
  const key = String(consultationId);

  const consultation =
    consultations.get(key);

  if (!consultation) {
    return;
  }

  if (consultation.customer === socketId) {
    delete consultation.customer;
  }

  if (consultation.vendor === socketId) {
    delete consultation.vendor;
  }

  if (
    !consultation.customer &&
    !consultation.vendor
  ) {
    consultations.delete(key);
  }
};

const getOnlineUserIds = () => {
  return Array.from(users.keys());
};

module.exports = {
  addUserSocket,
  removeUserSocket,
  getUserSockets,
  isUserOnline,

  setConsultationParticipant,
  getConsultation,
  removeConsultationParticipant,

  getOnlineUserIds,
};