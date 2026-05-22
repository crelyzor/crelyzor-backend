import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  listNotificationsSchema,
  notificationIdParamSchema,
} from "../validators/notificationSchema";
import {
  listNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  deleteAllRead,
  getUnreadCount,
} from "../services/notificationService";

export const list = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = listNotificationsSchema.safeParse(req.query);
  if (!validated.success) throw new AppError("Invalid query params", 400);

  const { cursor, limit } = validated.data;
  const result = await listNotifications(userId, cursor, limit);

  return apiResponse(res, {
    statusCode: 200,
    message: "Notifications fetched",
    data: result,
  });
};

export const unreadCount = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const count = await getUnreadCount(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Unread count fetched",
    data: { count },
  });
};

export const markOneRead = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = notificationIdParamSchema.safeParse(req.params);
  if (!validated.success) throw new AppError("Invalid notification id", 400);

  const notification = await markRead(userId, validated.data.id);
  if (!notification) throw new AppError("Notification not found", 404);

  return apiResponse(res, {
    statusCode: 200,
    message: "Notification marked as read",
    data: { notification },
  });
};

export const markAllAsRead = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const count = await markAllRead(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "All notifications marked as read",
    data: { count },
  });
};

export const remove = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = notificationIdParamSchema.safeParse(req.params);
  if (!validated.success) throw new AppError("Invalid notification id", 400);

  const deleted = await deleteNotification(userId, validated.data.id);
  if (!deleted) throw new AppError("Notification not found", 404);

  return apiResponse(res, {
    statusCode: 200,
    message: "Notification deleted",
  });
};

export const removeAllRead = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const count = await deleteAllRead(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Read notifications cleared",
    data: { count },
  });
};
