import WebSocket from "ws";
import { ExtendedWebSocket, WsServerMessage } from "./types";

const registry = new Map<string, Set<ExtendedWebSocket>>();

const MAX_SOCKETS_PER_USER = 5;

export function add(userId: string, ws: ExtendedWebSocket): void {
  if (!registry.has(userId)) registry.set(userId, new Set());
  const sockets = registry.get(userId)!;

  if (sockets.size >= MAX_SOCKETS_PER_USER) {
    // Close the oldest socket to make room
    const oldest = sockets.values().next().value as ExtendedWebSocket;
    oldest.close(4008, "Connection limit reached");
    sockets.delete(oldest);
  }

  sockets.add(ws);
}

export function remove(userId: string, ws: ExtendedWebSocket): void {
  const sockets = registry.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) registry.delete(userId);
}

export function broadcast(userId: string, msg: WsServerMessage): void {
  const sockets = registry.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify(msg);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function size(userId: string): number {
  return registry.get(userId)?.size ?? 0;
}
