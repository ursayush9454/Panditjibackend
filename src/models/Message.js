const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },

    message: {
      type: String,
      trim: true,
      default: "",
    },

    attachmentUrl: {
      type: String,
      trim: true,
      default: "",
    },

    attachmentName: {
      type: String,
      trim: true,
      default: "",
    },

    attachmentType: {
      type: String,
      trim: true,
      default: "",
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({
  conversation: 1,
  createdAt: -1,
});

messageSchema.index({
  receiver: 1,
  isRead: 1,
});

module.exports = mongoose.model("Message", messageSchema);