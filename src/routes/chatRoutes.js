const r = require("express").Router();

const c = require("../controllers/chatController");
const auth = require("../middleware/auth");

/*
  Create / get conversation
*/
r.post(
  "/conversations",
  auth,
  c.createConversation
);

/*
  My conversations
*/
r.get(
  "/conversations",
  auth,
  c.getMyConversations
);

/*
  Single conversation
*/
r.get(
  "/conversations/:id",
  auth,
  c.getConversation
);

/*
  Send message
*/
r.post(
  "/conversations/:id/messages",
  auth,
  c.sendMessage
);

/*
  Get messages
*/
r.get(
  "/conversations/:id/messages",
  auth,
  c.getMessages
);

/*
  Mark conversation read
*/
r.put(
  "/conversations/:id/read",
  auth,
  c.markConversationRead
);

/*
  Close conversation
*/
r.put(
  "/conversations/:id/close",
  auth,
  c.closeConversation
);

/*
  Unread count
*/
r.get(
  "/unread-count",
  auth,
  c.getUnreadCount
);

/*
  Delete own message
*/
r.delete(
  "/messages/:messageId",
  auth,
  c.deleteMessage
);

module.exports = r;