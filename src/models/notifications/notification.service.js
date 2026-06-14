import Notification from "./notification.model.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";
import { emitNotificationRead } from "../../socket/emitters.js";

const SAFE_ACTOR_FIELDS = "name role profile_image";
const SAFE_JOB_FIELDS = "title category location status";
const SAFE_CONVERSATION_FIELDS = "_id";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const isUnexpectedDuplicateKeyError = (error) => error?.code === 11000;

export const createNotificationPersistenceError = () =>
  new AppError("Unable to persist notification", 500, statusText.ERROR);

const buildPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const createPaginationMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

const applyFilters = (userId, query = {}) => {
  const filter = { recipient: userId };

  if (query.is_read !== undefined) filter.is_read = query.is_read;
  if (query.type) filter.type = query.type;

  return filter;
};

const assertNotificationExists = (notification) => {
  if (!notification) {
    throw new AppError("Notification not found", 404, statusText.FAIL);
  }
};

export const createNotification = async ({
  recipient,
  actor = null,
  type,
  title,
  message,
  entityType,
  entityId,
  job = null,
  conversation = null,
  deduplicationKey,
  session = null,
}) =>
  await Notification.findOneAndUpdate(
    {
      deduplication_key: deduplicationKey,
    },
    {
      $setOnInsert: {
        recipient,
        actor,
        type,
        title,
        message,
        entity_type: entityType,
        entity_id: entityId,
        job,
        conversation,
        is_read: false,
        read_at: null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      session,
    }
  );

export const getNotifications = async (userId, query = {}) => {
  const pagination = buildPagination(query);
  const filter = applyFilters(userId, query);

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("actor", SAFE_ACTOR_FIELDS)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("conversation", SAFE_CONVERSATION_FIELDS)
      .select("-__v -deduplication_key")
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return {
    notifications,
    pagination: createPaginationMeta(pagination, total),
  };
};

export const getUnreadCount = async (userId) => {
  const unread_count = await Notification.countDocuments({
    recipient: userId,
    is_read: false,
  });

  return { unread_count };
};

export const markNotificationRead = async (notificationId, userId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  assertNotificationExists(notification);

  if (!notification.is_read) {
    notification.is_read = true;
    notification.read_at = new Date();
    await notification.save();
  }

  const [result, unreadCount] = await Promise.all([
    Notification.findById(notification._id)
      .populate("actor", SAFE_ACTOR_FIELDS)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("conversation", SAFE_CONVERSATION_FIELDS)
      .select("-__v -deduplication_key")
      .lean(),
    Notification.countDocuments({ recipient: userId, is_read: false }),
  ]);

  emitNotificationRead({ recipientId: userId, unreadCount });

  return result;
};

export const markAllNotificationsRead = async (userId) => {
  const result = await Notification.updateMany(
    {
      recipient: userId,
      is_read: false,
    },
    {
      is_read: true,
      read_at: new Date(),
    }
  );

  emitNotificationRead({ recipientId: userId, unreadCount: 0 });

  return {
    modified_count: result.modifiedCount,
  };
};
