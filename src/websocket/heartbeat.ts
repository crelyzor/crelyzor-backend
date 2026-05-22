import { WebSocketServer } from "ws";
import { ExtendedWebSocket } from "./types";
import { logger } from "../utils/logging/logger";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function startHeartbeat(wss: WebSocketServer): NodeJS.Timeout {
  return setInterval(() => {
    wss.clients.forEach((raw) => {
      const ws = raw as ExtendedWebSocket;
      if (!ws.isAlive) {
        logger.warn("WebSocket: terminating dead connection");
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(interval: NodeJS.Timeout): void {
  clearInterval(interval);
}
