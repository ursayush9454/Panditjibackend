const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const DeviceToken = require("../models/DeviceToken");

let notificationIO = null;
let firebaseApp = null;

const getId = (value) => {
  if (!value) return null;
  return value._id || value.id || value;
};

const validObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)));

const setNotificationIO = (io) => {
  notificationIO = io;
};

const emitNotification = (userId, notification) => {
  try {
    if (!notificationIO || !userId) return false;

    notificationIO
      .to(`user:${String(getId(userId))}`)
      .emit("notification:new", notification);

    return true;
  } catch (error) {
    console.error("Emit Notification Error:", error.message);
    return false;
  }
};

const emitUnreadCount = async (userId) => {
  try {
    if (!notificationIO || !userId) return;

    const unreadCount = await Notification.countDocuments({
      user: getId(userId),
      isRead: false,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    notificationIO
      .to(`user:${String(getId(userId))}`)
      .emit("notification:unread-count", { unreadCount });
  } catch (error) {
    console.error("Unread Count Socket Error:", error.message);
  }
};

const getFirebase = () => {
  try {
    if (firebaseApp) return firebaseApp;

    const admin = require("firebase-admin");

    if (admin.apps.length) {
      firebaseApp = admin.app();
      return firebaseApp;
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath) {
      const serviceAccount = require(require("path").resolve(serviceAccountPath));
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      return firebaseApp;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
      return firebaseApp;
    }

    return null;
  } catch (error) {
    console.error("Firebase Initialization Error:", error.message);
    return null;
  }
};

const sendPushNotification = async ({
  userId,
  title,
  message,
  data = {},
  type = "general",
}) => {
  try {
    if (!userId) {
      return { success: false, reason: "USER_ID_REQUIRED" };
    }

    const adminApp = getFirebase();

    if (!adminApp) {
      return { success: false, reason: "FCM_NOT_CONFIGURED" };
    }

    const tokens = await DeviceToken.find({
      user: getId(userId),
      isActive: true,
    }).select("_id token");

    if (!tokens.length) {
      return { success: false, reason: "NO_FCM_TOKEN" };
    }

    const admin = require("firebase-admin");
    const tokenStrings = [...new Set(tokens.map((item) => item.token).filter(Boolean))];

    if (!tokenStrings.length) {
      return { success: false, reason: "NO_FCM_TOKEN" };
    }

    const stringData = Object.fromEntries(
      Object.entries({
        ...data,
        type,
      }).map(([key, value]) => [
        key,
        value === null || value === undefined ? "" : String(value),
      ])
    );

    const response = await admin.messaging(adminApp).sendEachForMulticast({
      tokens: tokenStrings,
      notification: {
        title: String(title || "Notification"),
        body: String(message || ""),
      },
      data: stringData,
      android: {
        priority: "high",
        notification: { channelId: "default" },
      },
      apns: {
        payload: {
          aps: { sound: "default" },
        },
      },
    });

    const invalidTokens = [];

    response.responses.forEach((result, index) => {
      if (!result.success) {
        const code = result.error?.code || "";

        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token")
        ) {
          invalidTokens.push(tokenStrings[index]);
        }
      }
    });

    if (invalidTokens.length) {
      await DeviceToken.updateMany(
        { token: { $in: invalidTokens } },
        { $set: { isActive: false } }
      );
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      reason: response.successCount ? undefined : "FCM_SEND_FAILED",
    };
  } catch (error) {
    console.error("Push Notification Error:", error.message);
    return {
      success: false,
      reason: "PUSH_ERROR",
      error: error.message,
    };
  }
};

const createNotification = async ({
  user,
  type = "general",
  title,
  message,
  priority = "normal",
  actionUrl = "",
  actionType = "",
  referenceId = null,
  referenceType = "",
  data = {},
  metadata = {},
  channels = ["in_app", "socket", "push"],
  expiresAt = null,
  createdBy = null,
  isSystemGenerated = true,
}) => {
  let notification;

  try {
    const userId = getId(user);

    if (!userId) throw new Error("Notification user is required");
    if (!String(title || "").trim()) throw new Error("Notification title is required");
    if (!String(message || "").trim()) throw new Error("Notification message is required");

    const safeChannels = [...new Set(
      (Array.isArray(channels) ? channels : ["in_app"])
        .filter((channel) =>
          ["in_app", "socket", "push", "email", "sms"].includes(channel)
        )
    )];

    notification = await Notification.create({
      user: userId,
      type,
      title: String(title).trim().slice(0, 150),
      message: String(message).trim().slice(0, 500),
      priority,
      actionUrl,
      actionType,
      referenceId:
  referenceId && validObjectId(getId(referenceId))
    ? getId(referenceId)
    : null,
      referenceType,
      data,
      metadata,
      channels: safeChannels.length ? safeChannels : ["in_app"],
      expiresAt,
      createdBy: validObjectId(getId(createdBy)) ? getId(createdBy) : null,
      isSystemGenerated,
    });

    // Socket delivery: notification remains saved if socket is unavailable.
    if (safeChannels.includes("socket")) {
      const delivered = emitNotification(userId, notification.toObject());

      if (delivered) {
        notification.socketDelivered = true;
        notification.socketDeliveredAt = new Date();
        await notification.save();
      }
    }

    // Push delivery is isolated from database and socket delivery.
    if (safeChannels.includes("push")) {
      const pushResult = await sendPushNotification({
        userId,
        title,
        message,
        type,
        data: {
          notificationId: String(notification._id),
          actionType,
          actionUrl,
          referenceId: referenceId ? String(getId(referenceId)) : "",
          ...data,
        },
      });

      if (pushResult.success) {
        notification.pushDelivered = true;
        notification.pushDeliveredAt = new Date();
        notification.pushError = "";
      } else if (pushResult.reason !== "FCM_NOT_CONFIGURED") {
        notification.pushError = String(pushResult.reason || "PUSH_FAILED").slice(0, 500);
      }

      await notification.save();
    }

    await emitUnreadCount(userId);
    return notification;
  } catch (error) {
    console.error("Create Notification Error:", error.message);
    // Return null rather than breaking booking/chat operations.
    return null;
  }
};

const createBulkNotifications = async ({
  users = [],
  type = "general",
  title,
  message,
  priority = "normal",
  actionUrl = "",
  actionType = "",
  referenceId = null,
  referenceType = "",
  data = {},
  metadata = {},
  channels = ["in_app", "socket", "push"],
  createdBy = null,
}) => {
  const uniqueUsers = [...new Set(
    users.map((item) => String(getId(item) || "")).filter(validObjectId)
  )];

  const results = [];

  for (const userId of uniqueUsers) {
    const notification = await createNotification({
      user: userId,
      type,
      title,
      message,
      priority,
      actionUrl,
      actionType,
      referenceId,
      referenceType,
      data,
      metadata,
      channels,
      createdBy,
      isSystemGenerated: !createdBy,
    });

    if (notification) results.push(notification);
  }

  return results;
};

// ------------------------------------------------------
// BOOKING HELPERS
// ------------------------------------------------------

const notifyBookingCreated = ({ userId, booking, vendorName = "Partner" }) =>
  createNotification({
    user: userId,
    type: "booking_created",
    title: "Booking Request Sent",
    message: `Your booking request has been sent to ${vendorName}.`,
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: booking?.status || "pending",
      vendorName,
      notificationStyle: "booking",
    },
  });

const notifyBookingAccepted = ({ userId, booking, vendorName = "Partner" }) =>
  createNotification({
    user: userId,
    type: "booking_accepted",
    title: "Booking Accepted",
    message: `${vendorName} has accepted your booking.`,
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "confirmed",
      vendorName,
      notificationStyle: "booking",
    },
  });

const notifyBookingRejected = ({
  userId, booking, vendorName = "Partner", reason = "",
}) =>
  createNotification({
    user: userId,
    type: "booking_rejected",
    title: "Booking Rejected",
    message: reason
      ? `${vendorName} could not accept your booking. Reason: ${reason}`.slice(0, 500)
      : `${vendorName} could not accept your booking.`,
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "rejected",
      vendorName,
      reason,
      notificationStyle: "booking",
    },
  });

const notifyBookingCancelled = ({
  userId, booking, cancelledBy = "", reason = "",
}) =>
  createNotification({
    user: userId,
    type: "booking_cancelled",
    title: "Booking Cancelled",
    message: reason
      ? `Your booking has been cancelled. Reason: ${reason}`.slice(0, 500)
      : "Your booking has been cancelled.",
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "cancelled",
      cancelledBy,
      reason,
      notificationStyle: "booking",
    },
  });

const notifyBookingRescheduled = ({
  userId, booking, rescheduledBy = "", reason = "",
}) =>
  createNotification({
    user: userId,
    type: "booking_rescheduled",
    title: "Booking Rescheduled",
    message: reason
      ? `Your booking schedule has been updated. ${reason}`.slice(0, 500)
      : "Your booking schedule has been updated.",
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "rescheduled",
      rescheduledBy,
      reason,
      notificationStyle: "booking",
    },
  });

const notifyBookingStarted = ({ userId, booking, vendorName = "Partner" }) =>
  createNotification({
    user: userId,
    type: "booking_started",
    title: "Booking Started",
    message: `${vendorName}: your booking has started.`,
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "started",
      notificationStyle: "booking",
    },
  });

const notifyBookingCompleted = ({ userId, booking, vendorName = "Partner" }) =>
  createNotification({
    user: userId,
    type: "booking_completed",
    title: "Booking Completed",
    message: `Your booking with ${vendorName} has been completed successfully.`,
    priority: "normal",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "completed",
      notificationStyle: "booking",
    },
  });

const notifyBookingNoShow = ({ userId, booking, vendorName = "Partner" }) =>
  createNotification({
    user: userId,
    type: "booking_no_show",
    title: "Booking No Show",
    message: `The booking with ${vendorName} has been marked as no-show.`,
    priority: "high",
    actionType: "open_booking",
    referenceId: booking?._id,
    referenceType: "Booking",
    data: {
      bookingId: String(booking?._id || ""),
      bookingStatus: "no_show",
      notificationStyle: "booking",
    },
  });

// ------------------------------------------------------
// CHAT / CONSULTATION / GENERAL
// ------------------------------------------------------

const notifyChatMessage = ({
  userId,
  conversationId,
  messageId,
  senderName = "New Message",
  message,
}) =>
  createNotification({
    user: userId,
    type: "chat_message",
    title: String(senderName || "New Message").slice(0, 150),
    message: String(message || "You have a new message.").slice(0, 500),
    priority: "normal",
    actionType: "open_chat",
    referenceId: conversationId,
    referenceType: "Conversation",
    data: {
      conversationId: String(conversationId || ""),
      messageId: String(messageId || ""),
      senderName,
      notificationStyle: "chat",
    },
  });

const notifyConsultation = ({
  userId,
  type,
  consultation,
  title,
  message,
}) =>
  createNotification({
    user: userId,
    type,
    title,
    message,
    priority: "high",
    actionType: "open_consultation",
    referenceId: consultation?._id,
    referenceType: "Consultation",
    data: {
      consultationId: String(consultation?._id || ""),
    },
  });

const notifyUser = ({
  userId,
  title,
  message,
  type = "general",
  priority = "normal",
  actionUrl = "",
  actionType = "",
  referenceId = null,
  referenceType = "",
  data = {},
  metadata = {},
  channels = ["in_app", "socket", "push"],
  createdBy = null,
}) =>
  createNotification({
    user: userId,
    title,
    message,
    type,
    priority,
    actionUrl,
    actionType,
    referenceId,
    referenceType,
    data,
    metadata,
    channels,
    createdBy,
    isSystemGenerated: !createdBy,
  });

module.exports = {
  getFirebase,
  setNotificationIO,
  emitNotification,
  emitUnreadCount,
  createNotification,
  createBulkNotifications,
  sendPushNotification,
  notifyUser,
  notifyBookingCreated,
  notifyBookingAccepted,
  notifyBookingRejected,
  notifyBookingCancelled,
  notifyBookingRescheduled,
  notifyBookingStarted,
  notifyBookingCompleted,
  notifyBookingNoShow,
  notifyChatMessage,
  notifyConsultation,
};