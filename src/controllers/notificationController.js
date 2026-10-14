const mongoose = require("mongoose");
const Notification = require("../models/Notification");

const {
  createNotification,
  createBulkNotifications,
  emitUnreadCount,
} = require("../services/notificationService");

const allowedChannels = ["in_app", "socket", "push", "email", "sms"];

const getUserId = (req) => req.user?.id || req.user?._id;

const isValidObjectId = (id) =>
  typeof id === "string" &&
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === id;

const getActiveNotificationFilter = (userId) => ({
  user: userId,
  $or: [
    { expiresAt: null },
    { expiresAt: { $gt: new Date() } },
  ],
});

const sendServerError = (res, error, label) => {
  console.error(label, error);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const requireUser = (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return null;
  }

  return userId;
};

const validatePayload = (body) => {
  const typeValues = Notification.schema.path("type").enumValues;
  const priorityValues = Notification.schema.path("priority").enumValues;
  const actionValues = Notification.schema.path("actionType").enumValues;
  const referenceValues = Notification.schema.path("referenceType").enumValues;

  if (body.type && !typeValues.includes(body.type)) {
    return "Invalid notification type";
  }
  if (body.priority && !priorityValues.includes(body.priority)) {
    return "Invalid notification priority";
  }
  if (body.actionType && !actionValues.includes(body.actionType)) {
    return "Invalid action type";
  }
  if (body.referenceType && !referenceValues.includes(body.referenceType)) {
    return "Invalid reference type";
  }

  if (
    body.channels !== undefined &&
    (!Array.isArray(body.channels) ||
      body.channels.length === 0 ||
      !body.channels.every((channel) => allowedChannels.includes(channel)))
  ) {
    return "Invalid notification channels";
  }

  if (
    body.actionUrl !== undefined &&
    typeof body.actionUrl !== "string"
  ) {
    return "actionUrl must be a string";
  }

  if (
    body.data !== undefined &&
    (body.data === null || typeof body.data !== "object" || Array.isArray(body.data))
  ) {
    return "data must be an object";
  }

  if (
    body.metadata !== undefined &&
    (body.metadata === null ||
      typeof body.metadata !== "object" ||
      Array.isArray(body.metadata))
  ) {
    return "metadata must be an object";
  }

  return null;
};

// GET /api/partner/notifications
exports.getNotifications = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = getActiveNotificationFilter(userId);

    if (req.query.unread === "true") filter.isRead = false;
    if (req.query.unread === "false") filter.isRead = true;

    if (req.query.type) {
      const allowedTypes = Notification.schema.path("type").enumValues;
      if (!allowedTypes.includes(String(req.query.type))) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification type",
        });
      }
      filter.type = String(req.query.type);
    }

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        ...getActiveNotificationFilter(userId),
        isRead: false,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNextPage: skip + notifications.length < total,
        hasPreviousPage: page > 1,
      },
      unreadCount,
    });
  } catch (error) {
    return sendServerError(res, error, "Get Notifications Error:");
  }
};

// GET /api/partner/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const unreadCount = await Notification.countDocuments({
      ...getActiveNotificationFilter(userId),
      isRead: false,
    });

    return res.json({ success: true, unreadCount });
  } catch (error) {
    return sendServerError(res, error, "Get Unread Count Error:");
  }
};

// GET /api/partner/notifications/:id
exports.getNotification = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }

    const notification = await Notification.findOne({
      _id: id,
      ...getActiveNotificationFilter(userId),
    }).lean();

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({ success: true, data: notification });
  } catch (error) {
    return sendServerError(res, error, "Get Notification Error:");
  }
};

// PUT /api/partner/notifications/:id/read
exports.markAsRead = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        ...getActiveNotificationFilter(userId),
      },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true, runValidators: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await emitUnreadCount(userId);

    return res.json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    return sendServerError(res, error, "Mark Notification Read Error:");
  }
};

// PUT /api/partner/notifications/read-all
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const result = await Notification.updateMany(
      {
        ...getActiveNotificationFilter(userId),
        isRead: false,
      },
      { $set: { isRead: true, readAt: new Date() } }
    );

    await emitUnreadCount(userId);

    return res.json({
      success: true,
      message: "All active notifications marked as read",
      modifiedCount: result.modifiedCount || 0,
      unreadCount: 0,
    });
  } catch (error) {
    return sendServerError(res, error, "Mark All Read Error:");
  }
};

// DELETE /api/partner/notifications/:id
exports.deleteNotification = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }

    const deleted = await Notification.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await emitUnreadCount(userId);

    return res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    return sendServerError(res, error, "Delete Notification Error:");
  }
};

// DELETE /api/partner/notifications/read-all
exports.deleteAllRead = async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const result = await Notification.deleteMany({
      ...getActiveNotificationFilter(userId),
      isRead: true,
    });

    await emitUnreadCount(userId);

    return res.json({
      success: true,
      message: "All active read notifications deleted",
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    return sendServerError(res, error, "Delete All Read Error:");
  }
};

// POST /api/partner/notifications/admin/send
exports.adminSendNotification = async (req, res) => {
  try {
    const adminId = requireUser(req, res);
    if (!adminId) return;

    const {
      userId,
      title,
      message,
      type = "admin_message",
      priority = "normal",
      actionUrl = "",
      actionType = "",
      referenceId = null,
      referenceType = "",
      data = {},
      metadata = {},
      channels = ["in_app", "socket", "push"],
    } = req.body;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "A valid userId is required",
      });
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 150 ||
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid title and message are required",
      });
    }

    if (referenceId && !isValidObjectId(referenceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid referenceId",
      });
    }

    const validationError = validatePayload({
      type, priority, actionType, referenceType,
      actionUrl, data, metadata, channels,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const notification = await createNotification({
      user: userId,
      type,
      title: title.trim(),
      message: message.trim(),
      priority,
      actionUrl,
      actionType,
      referenceId,
      referenceType,
      data,
      metadata,
      channels,
      createdBy: adminId,
      isSystemGenerated: false,
    });

    if (!notification) {
      return res.status(500).json({
        success: false,
        message: "Notification could not be created",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Notification created",
      data: notification,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return sendServerError(res, error, "Admin Send Notification Error:");
  }
};

// POST /api/partner/notifications/admin/broadcast
exports.adminBroadcastNotification = async (req, res) => {
  try {
    const adminId = requireUser(req, res);
    if (!adminId) return;

    const {
      userIds,
      title,
      message,
      type = "admin_announcement",
      priority = "normal",
      actionUrl = "",
      actionType = "",
      data = {},
      metadata = {},
      channels = ["in_app", "socket", "push"],
    } = req.body;

    if (!Array.isArray(userIds) || !userIds.length || userIds.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Provide between 1 and 500 user IDs",
      });
    }

    if (userIds.some((id) => !isValidObjectId(id))) {
      return res.status(400).json({
        success: false,
        message: "One or more user IDs are invalid",
      });
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 150 ||
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid title and message are required",
      });
    }

    const validationError = validatePayload({
      type, priority, actionType, actionUrl,
      data, metadata, channels,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const notifications = await createBulkNotifications({
      users: userIds,
      type,
      title: title.trim(),
      message: message.trim(),
      priority,
      actionUrl,
      actionType,
      data,
      metadata,
      channels,
      createdBy: adminId,
    });

    return res.status(201).json({
      success: true,
      message: "Broadcast notification processed",
      count: notifications.length,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return sendServerError(res, error, "Admin Broadcast Error:");
  }
};