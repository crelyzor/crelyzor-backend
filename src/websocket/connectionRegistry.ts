import WebSocket from "ws";
import { ExtendedWebSocket, WsServerMessage } from "./types";

const registry = new Map<string, Set<ExtendedWebSocket>>();

export function add(userId: string, ws: ExtendedWebSocket): void {
  if (!registry.has(userId)) registry.set(userId, new Set());
  registry.get(userId)!.add(ws);
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
