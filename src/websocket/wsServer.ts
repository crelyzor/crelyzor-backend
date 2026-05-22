import { Server as HttpServer, IncomingMessage } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { z } from "zod";
import { tokenService } from "../services/auth/tokenService";
import { sessionService } from "../services/auth/sessionService";
import { getRedisClient } from "../config/redisClient";
import * as registry from "./connectionRegistry";
import * as subscriber from "./notificationSubscriber";
import { startHeartbeat, stopHeartbeat } from "./heartbeat";
import { ExtendedWebSocket, WsServerMessage } from "./types";
import { logger } from "../utils/logging/logger";
import prisma from "../db/prismaClient";

const AUTH_TIMEOUT_MS = 5_000;
const WS_MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// Zod schemas for runtime validation of incoming messages
const wsAuthSchema = z.object({
  type: z.literal("AUTH"),
  token: z.string().min(1).max(2048),
});

const wsClientMessageSchema = z.discriminatedUnion("type", [
  wsAuthSchema,
  z.object({ type: z.literal("PING") }),
  z.object({ type: z.literal("PONG") }),
]);

let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

function getAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  if (!raw) {
    return new Set(["http://localhost:5173", "http://localhost:5174"]);
  }
  return new Set(raw.split(",").map((o) => o.trim()));
}

async function checkConnectionRateLimit(ip: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `ws:conn:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    return count <= RATE_LIMIT_MAX;
  } catch {
    // Fail-open: if Redis is unavailable, allow the connection
    return true;
  }
}

export function createWsServer(httpServer: HttpServer): void {
  subscriber.initSubscriber();

  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    clientTracking: true,
    maxPayload: WS_MAX_PAYLOAD_BYTES,
  });

  heartbeatInterval = startHeartbeat(wss);

  wss.on("connection", async (raw: WebSocket, req: IncomingMessage) => {
    const ws = raw as ExtendedWebSocket;
    ws.isAlive = true;

    // Native pong resets the liveness flag for heartbeat
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Origin validation — CORS middleware does not cover WS upgrades
    const origin = req.headers.origin;
    const allowedOrigins = getAllowedOrigins();
    if (origin && !allowedOrigins.has(origin)) {
      logger.warn("WebSocket: rejected connection from disallowed origin", { origin });
      ws.close(4000, "Origin not allowed");
      return;
    }

    // IP rate limit — prevents auth DB flooding
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "unknown";

    const allowed = await checkConnectionRateLimit(ip);
    if (!allowed) {
      logger.warn("WebSocket: connection rate limit exceeded", { ip });
      ws.close(4029, "Rate limit exceeded");
      return;
    }

    let userId: string | null = null;

    const authTimeout = setTimeout(() => {
      if (!userId) {
        ws.close(4001, "Authentication timeout");
      }
    }, AUTH_TIMEOUT_MS);

    ws.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as unknown;
        const result = wsClientMessageSchema.safeParse(parsed);

        if (!result.success) {
          logger.warn("WebSocket: invalid message shape", {
            userId,
            error: result.error.message,
          });
          return;
        }

        const msg = result.data;

        if (!userId) {
          // Pre-auth: only AUTH is accepted
          if (msg.type !== "AUTH") {
            ws.close(4001, "First message must be AUTH");
            clearTimeout(authTimeout);
            return;
          }

          let decoded;
          try {
            decoded = tokenService.verifyAccessToken(msg.token);
          } catch {
            ws.close(4001, "Invalid token");
            clearTimeout(authTimeout);
            return;
          }

          const valid = await sessionService.validateSession(
            decoded.sessionId,
            decoded.userId,
          );

          // Race guard: authTimeout may have fired while we awaited the DB call
          if (ws.readyState !== WebSocket.OPEN) return;

          if (!valid) {
            ws.close(4001, "Invalid session");
            clearTimeout(authTimeout);
            return;
          }

          clearTimeout(authTimeout);
          userId = decoded.userId;

          registry.add(userId, ws);
          subscriber.subscribeUser(userId);

          const unreadCount = await prisma.notification.count({
            where: { userId, isRead: false, isDeleted: false },
          });

          const connectedMsg: WsServerMessage = {
            type: "CONNECTED",
            unreadCount,
          };
          ws.send(JSON.stringify(connectedMsg));

          logger.info("WebSocket: client authenticated", { userId });
          return;
        }

        // Post-auth message handling
        switch (msg.type) {
          case "PING":
            ws.send(JSON.stringify({ type: "PONG" } satisfies WsServerMessage));
            break;
          case "AUTH":
            // Re-auth attempt on an established connection — reject
            logger.warn("WebSocket: re-auth attempt on established connection", {
              userId,
            });
            ws.close(4003, "Already authenticated");
            break;
          default:
            logger.warn("WebSocket: unhandled message type", { userId, msg });
        }
      } catch (err) {
        logger.warn("WebSocket: message parse error", { userId, err });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (userId) {
        registry.remove(userId, ws);
        subscriber.unsubscribeUser(userId);
        logger.info("WebSocket: client disconnected", { userId });
      }
    });

    ws.on("error", (err) => {
      logger.error("WebSocket: connection error", { userId, err });
    });
  });

  logger.info("WebSocket server initialized on path /ws");
}

export function closeWsServer(): void {
  if (heartbeatInterval) {
    stopHeartbeat(heartbeatInterval);
    heartbeatInterval = null;
  }
  subscriber.closeSubscriber();
  if (wss) {
    wss.close();
    wss = null;
  }
}
