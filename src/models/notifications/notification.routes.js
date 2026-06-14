import express from "express";
import verifyAccess from "../../middlewares/verifyAccess.js";
import { validate } from "../../middlewares/validate.js";
import {
  NotificationIdParamsSchema,
  NotificationListingQuerySchema,
} from "./notification.validation.js";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notification.controller.js";

const notificationRoutes = express.Router();

notificationRoutes.get(
  "/",
  verifyAccess,
  validate(NotificationListingQuerySchema, "query"),
  getNotifications
);

notificationRoutes.get(
  "/unread-count",
  verifyAccess,
  getUnreadCount
);

notificationRoutes.patch(
  "/read-all",
  verifyAccess,
  markAllNotificationsRead
);

notificationRoutes.patch(
  "/:id/read",
  verifyAccess,
  validate(NotificationIdParamsSchema, "params"),
  markNotificationRead
);

export default notificationRoutes;
