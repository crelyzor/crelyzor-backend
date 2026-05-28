import IORedis from "ioredis";
import { getRedisClient } from "../config/redisClient";
import * as registry from "./connectionRegistry";
import { WsNotificationPayload } from "./types";
import { logger } from "../utils/logging/logger";

let sharedSub: IORedis | null = null;

export function initSubscriber(): void {
  sharedSub = getRedisClient().duplicate();

  sharedSub.on("message", (channel: string, message: string) => {
    try {
      const userId = channel.replace("notify:", "");
      const data = JSON.parse(message) as WsNotificationPayload;
      registry.broadcast(userId, { type: "NOTIFICATION", data });
    } catch (err) {
      logger.error("notificationSubscriber: failed to handle message", { err });
    }
  });

  sharedSub.on("error", (err) => {
    logger.error("notificationSubscriber: Redis subscriber error", { err });
  });
}

export function subscribeUser(userId: string): void {
  if (!sharedSub) return;
  // Only subscribe on first connection for this user (avoid duplicate subscriptions)
  if (registry.size(userId) === 1) {
    sharedSub.subscribe(`notify:${userId}`).catch((err) => {
      logger.error("notificationSubscriber: failed to subscribe", {
        userId,
        err,
      });
    });
  }
}

export function unsubscribeUser(userId: string): void {
  if (!sharedSub) return;
  // Only unsubscribe when last connection for this user closes
  if (registry.size(userId) === 0) {
    sharedSub.unsubscribe(`notify:${userId}`).catch((err) => {
      logger.error("notificationSubscriber: failed to unsubscribe", {
        userId,
        err,
      });
    });
  }
}

export function closeSubscriber(): void {
  if (sharedSub) {
    sharedSub.quit().catch(() => {
      // Ignore quit errors during shutdown
    });
    sharedSub = null;
  }
}

export function publishNotification(
  userId: string,
  payload: WsNotificationPayload,
): void {
  getRedisClient()
    .publish(`notify:${userId}`, JSON.stringify(payload))
    .catch((err) => {
      logger.error("notificationSubscriber: failed to publish", {
        userId,
        err,
      });
    });
}
