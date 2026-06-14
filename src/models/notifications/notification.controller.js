import * as notificationService from "./notification.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const getNotifications = catchError(async (req, res) => {
  const { notifications, pagination } =
    await notificationService.getNotifications(req.user.userId, req.query);

  res.json({
    status: statusText.SUCCESS,
    data: notifications,
    pagination,
  });
});

export const getUnreadCount = catchError(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: count,
  });
});

export const markNotificationRead = catchError(async (req, res) => {
  const notification = await notificationService.markNotificationRead(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: notification,
  });
});

export const markAllNotificationsRead = catchError(async (req, res) => {
  const result = await notificationService.markAllNotificationsRead(
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});
