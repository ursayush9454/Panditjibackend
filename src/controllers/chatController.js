
const mongoose = require("mongoose");

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const Consultation = require("../models/Consultation");

const {
  notifyChatMessage,
} = require("../services/notificationService");

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id || ""));

const getUserId = (req) => req.user?.id || req.user?._id;

const isParticipant = (conversation, userId) =>
  conversation.participants.some(
    (participant) => String(participant) === String(userId)
  );

const getOtherParticipant = (conversation, userId) =>
  conversation.participants.find(
    (participant) => String(participant) !== String(userId)
  );

const getConversationForUser = async (conversationId, userId) => {
  if (!isValidObjectId(conversationId)) return null;

  const conversation = await Conversation.findById(conversationId);

  if (!conversation || !isParticipant(conversation, userId)) {
    return null;
  }

  return conversation;
};

const populateConversation = (query) =>
  query
    .populate({
      path: "customer",
      select: "name phone email role",
    })
    .populate({
      path: "astrologer",
      select:
        "name phone email role isOnline status profileImage chatRate audioRate videoRate",
    })
    .populate({
      path: "consultation",
      select:
        "type status startedAt endedAt durationMinutes ratePerMinute totalAmount",
    })
    .populate({
      path: "lastMessageSender",
      select: "name role",
    });

const getAstrologerUserId = async (conversation) => {
  const vendor = await Vendor.findById(conversation.astrologer).select("user");

  return vendor?.user ? String(vendor.user) : null;
};

// ======================================================
// CREATE CONVERSATION
// POST /api/partner/chat/conversations
// ======================================================

exports.createConversation = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { astrologerId, consultationId = null } = req.body;

    if (!astrologerId || !isValidObjectId(astrologerId)) {
      return res.status(400).json({
        success: false,
        message: "A valid astrologer ID is required",
      });
    }

    const customer = await User.findById(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (customer.role && customer.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can start an astrologer chat",
      });
    }

    const astrologer = await Vendor.findOne({
      _id: astrologerId,
      role: { $in: ["astrologer", "pandit", "mandali"] },
      status: "approved",
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Approved astrologer not found",
      });
    }

    let consultation = null;

    if (consultationId) {
      if (!isValidObjectId(consultationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid consultation ID",
        });
      }

      consultation = await Consultation.findById(consultationId);

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message: "Consultation not found",
        });
      }

      if (String(consultation.customer) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: "This consultation does not belong to you",
        });
      }

      if (String(consultation.astrologer) !== String(astrologerId)) {
        return res.status(400).json({
          success: false,
          message: "Consultation and astrologer do not match",
        });
      }
    }

    // Find an existing conversation first.
    let conversation = consultation
      ? await Conversation.findOne({
          consultation: consultation._id,
        })
      : null;

    if (!conversation) {
      conversation = await Conversation.findOne({
        customer: userId,
        astrologer: astrologerId,
        status: "active",
      });
    }

    // Existing conversation: return the populated record.
    if (conversation) {
      const populated = await populateConversation(
        Conversation.findById(conversation._id)
      );

      return res.json({
        success: true,
        message: "Conversation already exists",
        conversation: populated,
      });
    }

    // Create a new conversation.
    conversation = await Conversation.create({
      participants: [customer._id, astrologer.user],
      customer: customer._id,
      astrologer: astrologer._id,
      consultation: consultation ? consultation._id : null,
    });

    const populated = await populateConversation(
      Conversation.findById(conversation._id)
    );

    return res.status(201).json({
      success: true,
      message: "Conversation created successfully",
      conversation: populated,
    });
  } catch (error) {
    console.error("Create Conversation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create conversation",
    });
  }
};

// ======================================================
// GET MY CONVERSATIONS
// GET /api/partner/chat/conversations
// ======================================================

exports.getMyConversations = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const conversations = await populateConversation(
      Conversation.find({
        participants: userId,
      }).sort({ updatedAt: -1 })
    );

    return res.json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (error) {
    console.error("Get Conversations Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

// ======================================================
// GET SINGLE CONVERSATION
// GET /api/partner/chat/conversations/:id
// ======================================================

exports.getConversation = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    const conversation = await populateConversation(
      Conversation.findById(id)
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    if (!isParticipant(conversation, userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation",
      });
    }

    return res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Get Conversation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversation",
    });
  }
};

// ======================================================
// SEND MESSAGE
// POST /api/partner/chat/conversations/:id/messages
// ======================================================

exports.sendMessage = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    const {
      message = "",
      type = "text",
      attachmentUrl = "",
      attachmentName = "",
      attachmentType = "",
    } = req.body;

    const conversation = await getConversationForUser(id, userId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or access denied",
      });
    }

    if (conversation.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Conversation is closed",
      });
    }

    if (!["text", "image", "file"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message type",
      });
    }

    const cleanMessage = String(message || "").trim();
    const cleanAttachmentUrl = String(attachmentUrl || "").trim();

    if (type === "text" && !cleanMessage) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (["image", "file"].includes(type) && !cleanAttachmentUrl) {
      return res.status(400).json({
        success: false,
        message: "Attachment URL is required",
      });
    }

    if (cleanMessage.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Message is too long",
      });
    }

    const receiver = getOtherParticipant(conversation, userId);

    if (!receiver) {
      return res.status(400).json({
        success: false,
        message: "Receiver not found",
      });
    }

    const newMessage = await Message.create({
      conversation: conversation._id,
      sender: userId,
      receiver,
      type,
      message: cleanMessage,
      attachmentUrl: cleanAttachmentUrl,
      attachmentName: String(attachmentName || "").trim(),
      attachmentType: String(attachmentType || "").trim(),
    });

    const preview =
      cleanMessage ||
      (type === "image"
        ? "📷 Image"
        : type === "file"
          ? "📎 File"
          : "Message");

    conversation.lastMessage = preview.slice(0, 500);
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSender = userId;

    if (String(conversation.customer) === String(receiver)) {
      conversation.customerUnreadCount =
        (conversation.customerUnreadCount || 0) + 1;
    }

    const astrologerUserId = await getAstrologerUserId(conversation);

    if (
      astrologerUserId &&
      astrologerUserId === String(receiver)
    ) {
      conversation.astrologerUnreadCount =
        (conversation.astrologerUnreadCount || 0) + 1;
    }

    await conversation.save();

    await newMessage.populate({
      path: "sender",
      select: "name phone email role",
    });

    // Send notification on a best-effort basis.
    // A notification failure must not fail the saved message request.
    try {
      const senderName = newMessage.sender?.name || "New Message";

      let notificationText = cleanMessage;

      if (!notificationText) {
        notificationText =
          type === "image"
            ? "📷 Sent you an image"
            : type === "file"
              ? "📎 Sent you a file"
              : "You have a new message.";
      }

      await notifyChatMessage({
        userId: receiver,
        conversationId: conversation._id,
        messageId: newMessage._id,
        senderName,
        message: notificationText.slice(0, 180),
      });
    } catch (notificationError) {
      console.error(
        "Chat Notification Error:",
        notificationError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: newMessage,
    });
  } catch (error) {
    console.error("Send Message Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

// ======================================================
// GET MESSAGES
// GET /api/partner/chat/conversations/:id/messages
// ======================================================

exports.getMessages = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    let page = Number(req.query.page || 1);
    let limit = Number(req.query.limit || 50);

    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1) limit = 50;

    limit = Math.min(Math.floor(limit), 100);
    page = Math.floor(page);

    const conversation = await getConversationForUser(id, userId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or access denied",
      });
    }

    const filter = {
      conversation: conversation._id,
    };

    const skip = (page - 1) * limit;

    const [total, messages] = await Promise.all([
      Message.countDocuments(filter),
      Message.find(filter)
        .populate({
          path: "sender",
          select: "name phone email role",
        })
        .populate({
          path: "receiver",
          select: "name phone email role",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    messages.reverse();

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      messages,
    });
  } catch (error) {
    console.error("Get Messages Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
};

// ======================================================
// MARK CONVERSATION AS READ
// PUT /api/partner/chat/conversations/:id/read
// ======================================================

exports.markConversationRead = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const conversation = await getConversationForUser(id, userId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or access denied",
      });
    }

    const now = new Date();

    await Message.updateMany(
      {
        conversation: conversation._id,
        receiver: userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: now,
        },
      }
    );

    if (String(conversation.customer) === String(userId)) {
      conversation.customerUnreadCount = 0;
    } else {
      const astrologerUserId = await getAstrologerUserId(conversation);

      if (astrologerUserId === String(userId)) {
        conversation.astrologerUnreadCount = 0;
      }
    }

    await conversation.save();

    return res.json({
      success: true,
      message: "Conversation marked as read",
    });
  } catch (error) {
    console.error("Mark Conversation Read Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark conversation as read",
    });
  }
};

// ======================================================
// GET CHAT UNREAD COUNT
// GET /api/partner/chat/unread-count
// ======================================================

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const conversations = await Conversation.find({
      participants: userId,
    }).select(
      "customer astrologer customerUnreadCount astrologerUnreadCount"
    );

    let unreadCount = 0;

    for (const conversation of conversations) {
      if (String(conversation.customer) === String(userId)) {
        unreadCount += conversation.customerUnreadCount || 0;
      } else {
        const astrologerUserId = await getAstrologerUserId(conversation);

        if (astrologerUserId === String(userId)) {
          unreadCount += conversation.astrologerUnreadCount || 0;
        }
      }
    }

    return res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Chat Unread Count Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
    });
  }
};

// ======================================================
// DELETE OWN MESSAGE
// DELETE /api/partner/chat/messages/:messageId
// ======================================================

exports.deleteMessage = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { messageId } = req.params;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID",
      });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (String(message.sender) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own message",
      });
    }

    if (message.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Message is already deleted",
      });
    }

    // Verify the sender still belongs to the conversation.
    const conversation = await getConversationForUser(
      message.conversation,
      userId
    );

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this conversation",
      });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.message = "This message was deleted";
    message.attachmentUrl = "";
    message.attachmentName = "";
    message.attachmentType = "";

    await message.save();

    return res.json({
      success: true,
      message: "Message deleted successfully",
      data: message,
    });
  } catch (error) {
    console.error("Delete Message Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete message",
    });
  }
};

// ======================================================
// CLOSE CONVERSATION
// PUT /api/partner/chat/conversations/:id/close
// ======================================================

exports.closeConversation = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const conversation = await getConversationForUser(id, userId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or access denied",
      });
    }

    if (conversation.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Conversation is already closed",
      });
    }

    conversation.status = "closed";
    conversation.closedAt = new Date();

    await conversation.save();

    return res.json({
      success: true,
      message: "Conversation closed successfully",
      conversation,
    });
  } catch (error) {
    console.error("Close Conversation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to close conversation",
    });
  }
};

