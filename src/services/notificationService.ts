import { NotificationType } from "@prisma/client";
import prisma from "../db/prismaClient";
import { publishNotification } from "../websocket/notificationSubscriber";
import { logger } from "../utils/logging/logger";

const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  entityType: true,
  entityId: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} as const;

const PREF_MAP = {
  BOOKING_RECEIVED: "inAppBookingEnabled",
  BOOKING_CONFIRMED: "inAppBookingEnabled",
  BOOKING_CANCELLED: "inAppBookingEnabled",
  BOOKING_REMINDER: "inAppBookingEnabled",
  MEETING_AI_COMPLETE: "inAppMeetingReadyEnabled",
  TASK_DUE_SOON: "inAppTaskDueEnabled",
} as const satisfies Record<NotificationType, string>;

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  entityType?: string,
  entityId?: string,
): Promise<void> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        inAppNotificationsEnabled: true,
        inAppBookingEnabled: true,
        inAppMeetingReadyEnabled: true,
        inAppTaskDueEnabled: true,
      },
    });

    if (!settings?.inAppNotificationsEnabled) return;
    if (settings && !settings[PREF_MAP[type]]) return;

    const notification = await prisma.notification.create({
      data: { userId, type, title, body, entityType, entityId },
      select: NOTIFICATION_SELECT,
    });

    publishNotification(userId, notification);
  } catch (err) {
    logger.error("notificationService: createNotification failed", {
      userId,
      type,
      err,
    });
  }
}

export async function listNotifications(
  userId: string,
  cursor?: string,
  limit = 20,
) {
  const take = Math.min(limit, 50);

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    select: NOTIFICATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });

  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

  return { notifications: items, nextCursor, hasMore };
}

export async function markRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, isDeleted: false },
    data: { isRead: true, readAt: new Date() },
  });

  if (result.count === 0) return null;

  return prisma.notification.findFirst({
    where: { id: notificationId, userId, isDeleted: false },
    select: NOTIFICATION_SELECT,
  });
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false, isDeleted: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

export async function deleteNotification(
  userId: string,
  notificationId: string,
) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return result.count > 0;
}

export async function deleteAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: true, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  return result.count;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false, isDeleted: false },
  });
}
