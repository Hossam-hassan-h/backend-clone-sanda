let io = null;

export const setSocketServer = (socketServer) => {
  io = socketServer;
};

const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId.toString()}`).emit(event, payload);
};

const safeEmit = (emitFn) => {
  try {
    emitFn();
  } catch (error) {
    console.warn(`Socket delivery warning: ${error.message}`);
  }
};

export const emitNotificationRead = ({ recipientId, unreadCount }) =>
  safeEmit(() => {
    emitToUser(recipientId, "notifications:unread-count", { unread_count: unreadCount });
  });

export const emitMessageCreated = ({
  senderId,
  recipientId,
  message,
  conversation,
  notification,
  recipientUnreadCount,
}) =>
  safeEmit(() => {
    emitToUser(recipientId, "message:new", message);
    emitToUser(recipientId, "notification:new", notification);
    emitToUser(recipientId, "notifications:unread-count", recipientUnreadCount);
    emitToUser(senderId, "conversation:updated", conversation);
    emitToUser(recipientId, "conversation:updated", conversation);
  });

export const emitConversationRead = ({
  readerId,
  otherParticipantId,
  conversationId,
  modifiedCount,
  readAt,
  conversation,
}) =>
  safeEmit(() => {
    const payload = {
      conversation: conversationId,
      reader: readerId,
      modified_count: modifiedCount,
      read_at: readAt,
    };

    emitToUser(readerId, "message:read", payload);
    emitToUser(otherParticipantId, "message:read", payload);

    if (conversation) {
      emitToUser(readerId, "conversation:updated", conversation);
      emitToUser(otherParticipantId, "conversation:updated", conversation);
    }
  });
