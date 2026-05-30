import IORedis from "ioredis";
import { getRedisClient } from "../config/redisClient";
import * as registry from "./connectionRegistry";
import { WsNotificationPayload, WsServerMessage } from "./types";
import { logger } from "../utils/logging/logger";

let sharedSub: IORedis | null = null;

/**
 * Phase 6 P7 — the channel `notify:${userId}` carries the FULL
 * `WsServerMessage` (notifications AND team events). The subscriber just
 * JSON.parses + broadcasts as-is — no longer wraps in `NOTIFICATION`.
 * Publishers must construct the typed envelope before publishing.
 */
export function initSubscriber(): void {
  sharedSub = getRedisClient().duplicate();

  sharedSub.on("message", (channel: string, message: string) => {
    try {
      const userId = channel.replace("notify:", "");
      const msg = JSON.parse(message) as WsServerMessage;
      registry.broadcast(userId, msg);
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

/**
 * Phase 6 P7 — canonical publish primitive. Sends a typed WsServerMessage
 * to a single user's outgoing channel. The receiving subscriber on every
 * instance fan-outs to that user's open WebSocket connections.
 *
 * Fail-open: logs but never throws.
 */
export function publishToUser(userId: string, msg: WsServerMessage): void {
  getRedisClient()
    .publish(`notify:${userId}`, JSON.stringify(msg))
    .catch((err) => {
      logger.error("notificationSubscriber: failed to publish", {
        userId,
        type: msg.type,
        err,
      });
    });
}

/**
 * Phase 4.9 — back-compat wrapper. Existing notification publishers call
 * this with the raw payload; we wrap it in the typed envelope before
 * shipping over Redis.
 */
export function publishNotification(
  userId: string,
  payload: WsNotificationPayload,
): void {
  publishToUser(userId, { type: "NOTIFICATION", data: payload });
}
