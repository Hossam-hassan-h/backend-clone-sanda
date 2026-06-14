import mongoose from "mongoose";
import Conversation from "./conversation.model.js";
import Message from "../messages/message.model.js";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import {
  createNotification,
  createNotificationPersistenceError,
  getUnreadCount,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const SAFE_USER_FIELDS = "name role profile_image";
const SAFE_JOB_FIELDS =
  "title category location status start_date end_date salary";
const SAFE_ASSIGNMENT_FIELDS =
  "status checked_in_at checked_out_at completed_at";
const DEFAULT_CONVERSATION_PAGE = 1;
const DEFAULT_CONVERSATION_LIMIT = 20;
const DEFAULT_MESSAGE_LIMIT = 30;
const MAX_LIMIT = 100;
const SEND_ALLOWED_ASSIGNMENT_STATUSES = ["assigned", "in_progress", "completed"];

const isDuplicateKeyError = (error) => error?.code === 11000;

const buildConversationPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || DEFAULT_CONVERSATION_PAGE, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_CONVERSATION_LIMIT, 1),
    MAX_LIMIT
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const buildMessagePagination = (query = {}) => ({
  before: query.before,
  limit: Math.min(
    Math.max(Number(query.limit) || DEFAULT_MESSAGE_LIMIT, 1),
    MAX_LIMIT
  ),
});

const createPaginationMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const assertAssignmentExists = (assignment) => {
  if (!assignment) {
    throw new AppError("Assignment not found", 404, statusText.FAIL);
  }
};

const assertConversationExists = (conversation) => {
  if (!conversation) {
    throw new AppError("Conversation not found", 404, statusText.FAIL);
  }
};

const isConversationMember = (conversation, userId) =>
  conversation.worker.toString() === userId ||
  conversation.employer.toString() === userId;

const assertConversationMember = (conversation, userId) => {
  if (!isConversationMember(conversation, userId)) {
    throw new AppError("Conversation not found", 404, statusText.FAIL);
  }
};

const isAssignmentMember = (assignment, userId) =>
  assignment.worker.toString() === userId ||
  assignment.employer.toString() === userId;

const assertAssignmentMember = (assignment, userId) => {
  if (!isAssignmentMember(assignment, userId)) {
    throw new AppError(
      "You are not allowed to access this assignment",
      403,
      statusText.FAIL
    );
  }
};

const assertNoSelfChat = (assignment) => {
  if (assignment.worker.toString() === assignment.employer.toString()) {
    throw new AppError("Self-chat is not allowed", 400, statusText.FAIL);
  }
};

const assertSendingAllowed = (assignment) => {
  if (!SEND_ALLOWED_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    throw new AppError(
      "This assignment does not allow new messages",
      400,
      statusText.FAIL
    );
  }
};

const getRecipientId = (conversation, senderId) => {
  if (conversation.worker.toString() === senderId) {
    return conversation.employer;
  }

  return conversation.worker;
};

const populateConversationQuery = (query) =>
  query
    .populate("worker", SAFE_USER_FIELDS)
    .populate("employer", SAFE_USER_FIELDS)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("assignment", SAFE_ASSIGNMENT_FIELDS)
    .select("-__v");

const getSafeConversationById = async (conversationId, session = null) => {
  let query = populateConversationQuery(Conversation.findById(conversationId));

  if (session) {
    query = query.session(session);
  }

  return await query.lean();
};

const getSafeMessageById = async (messageId) =>
  await Message.findById(messageId)
    .populate("sender", SAFE_USER_FIELDS)
    .select("-__v")
    .lean();

const getSafeNotificationById = async (notificationId) =>
  await mongoose
    .model("Notification")
    .findById(notificationId)
    .populate("actor", SAFE_USER_FIELDS)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("conversation", "_id")
    .select("-__v -deduplication_key")
    .lean();

const attachUnreadCounts = async (conversations, userId) => {
  if (conversations.length === 0) return conversations;

  const conversationIds = conversations.map((conversation) => conversation._id);
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        conversation: { $in: conversationIds },
        recipient: new mongoose.Types.ObjectId(userId),
        read_at: null,
      },
    },
    {
      $group: {
        _id: "$conversation",
        count: { $sum: 1 },
      },
    },
  ]);

  const countByConversationId = new Map(
    unreadCounts.map((item) => [item._id.toString(), item.count])
  );

  return conversations.map((conversation) => ({
    ...conversation,
    unread_count: countByConversationId.get(conversation._id.toString()) || 0,
  }));
};

const getAuthorizedConversationDocument = async (
  conversationId,
  userId,
  session = null
) => {
  let query = Conversation.findById(conversationId).select(
    "_id job assignment employer worker"
  );

  if (session) {
    query = query.session(session);
  }

  const conversation = await query;

  assertConversationExists(conversation);
  assertConversationMember(conversation, userId);

  return conversation;
};

export const createConversationForAssignment = async (assignmentId, userId) => {
  const assignment = await JobAssignment.findById(assignmentId).select(
    "_id job worker employer status"
  );

  assertAssignmentExists(assignment);
  assertAssignmentMember(assignment, userId);
  assertNoSelfChat(assignment);

  const existingConversation = await Conversation.findOne({
    assignment: assignment._id,
  }).select("_id");

  if (existingConversation) {
    return {
      conversation: await getSafeConversationById(existingConversation._id),
      created: false,
    };
  }

  if (assignment.status === "cancelled") {
    throw new AppError(
      "Cancelled assignments cannot start a new conversation",
      400,
      statusText.FAIL
    );
  }

  try {
    const [createdConversation] = await Conversation.create([
      {
        job: assignment.job,
        assignment: assignment._id,
        employer: assignment.employer,
        worker: assignment.worker,
      },
    ]);

    return {
      conversation: await getSafeConversationById(createdConversation._id),
      created: true,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const conversation = await Conversation.findOne({
      assignment: assignment._id,
    }).select("_id");

    assertConversationExists(conversation);

    return {
      conversation: await getSafeConversationById(conversation._id),
      created: false,
    };
  }
};

export const getConversations = async (userId, query = {}) => {
  const pagination = buildConversationPagination(query);
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const filter = {
    $or: [{ worker: userObjectId }, { employer: userObjectId }],
  };

  const [conversations, total] = await Promise.all([
    populateConversationQuery(
      Conversation.find(filter)
        .sort({ last_message_at: -1, updatedAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ).lean(),
    Conversation.countDocuments(filter),
  ]);

  return {
    conversations: await attachUnreadCounts(conversations, userId),
    pagination: createPaginationMeta(pagination, total),
  };
};

export const getConversationById = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId).select(
    "_id worker employer"
  );

  assertConversationExists(conversation);
  assertConversationMember(conversation, userId);

  return await getSafeConversationById(conversation._id);
};

export const getConversationMessages = async (
  conversationId,
  userId,
  query = {}
) => {
  await getAuthorizedConversationDocument(conversationId, userId);

  const pagination = buildMessagePagination(query);
  const filter = { conversation: conversationId };

  if (pagination.before) {
    filter._id = { $lt: new mongoose.Types.ObjectId(pagination.before) };
  }

  const messages = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(pagination.limit)
    .populate("sender", SAFE_USER_FIELDS)
    .select("-__v")
    .lean();

  return {
    messages: messages.reverse(),
    pagination: {
      limit: pagination.limit,
      before: pagination.before || null,
      next_before: messages.length ? messages[0]._id : null,
      order: "chronological",
    },
  };
};

export const sendMessage = async (conversationId, userId, content) => {
  const session = await mongoose.startSession();
  const trimmedContent = content.trim();

  try {
    let messageId;
    let notificationId;
    let senderId;
    let recipientId;
    let safeConversationId;

    await session.withTransaction(async () => {
      const conversation = await getAuthorizedConversationDocument(
        conversationId,
        userId,
        session
      );

      const assignment = await JobAssignment.findById(conversation.assignment)
        .select("_id job worker employer status")
        .session(session);

      assertAssignmentExists(assignment);
      assertNoSelfChat(assignment);
      assertSendingAllowed(assignment);

      if (
        assignment.worker.toString() !== conversation.worker.toString() ||
        assignment.employer.toString() !== conversation.employer.toString() ||
        assignment.job.toString() !== conversation.job.toString()
      ) {
        throw new AppError(
          "Conversation is not linked to this assignment",
          400,
          statusText.FAIL
        );
      }

      const recipient = getRecipientId(conversation, userId);
      senderId = userId;
      recipientId = recipient;
      safeConversationId = conversation._id;

      const [message] = await Message.create(
        [
          {
            conversation: conversation._id,
            sender: userId,
            recipient,
            content: trimmedContent,
            type: "text",
          },
        ],
        { session }
      );

      messageId = message._id;

      await Conversation.findByIdAndUpdate(
        conversation._id,
        {
          last_message: trimmedContent.slice(0, 500),
          last_message_at: message.createdAt,
        },
        { session, runValidators: true }
      );

      const notification = await createNotification({
        recipient,
        actor: userId,
        type: "message_received",
        title: "New message",
        message: "You received a new message.",
        entityType: "message",
        entityId: message._id,
        job: conversation.job,
        conversation: conversation._id,
        deduplicationKey: `message_received:${message._id}`,
        session,
      });

      notificationId = notification._id;
    });

    const [message, conversation, notification, unreadCount] =
      await Promise.all([
        getSafeMessageById(messageId),
        getSafeConversationById(safeConversationId),
        getSafeNotificationById(notificationId),
        getUnreadCount(recipientId),
      ]);

    return {
      message,
      emit: {
        senderId,
        recipientId,
        message,
        conversation,
        notification,
        recipientUnreadCount: unreadCount,
      },
    };
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};

export const markConversationRead = async (conversationId, userId) => {
  const conversation = await getAuthorizedConversationDocument(
    conversationId,
    userId
  );
  const otherParticipantId = getRecipientId(conversation, userId);
  const readAt = new Date();

  const result = await Message.updateMany(
    {
      conversation: conversationId,
      recipient: userId,
      read_at: null,
    },
    {
      read_at: readAt,
    }
  );

  const safeConversation = await getSafeConversationById(conversationId);

  return {
    result: {
      modified_count: result.modifiedCount,
    },
    emit: {
      readerId: userId,
      otherParticipantId,
      conversationId,
      modifiedCount: result.modifiedCount,
      readAt,
      conversation: safeConversation,
    },
  };
};
