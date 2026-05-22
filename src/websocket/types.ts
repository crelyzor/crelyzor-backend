import WebSocket from "ws";

export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

// Server → Client messages
export type WsServerMessage =
  | { type: "CONNECTED"; unreadCount: number }
  | { type: "NOTIFICATION"; data: Record<string, unknown> }
  | { type: "PING" }
  | { type: "PONG" };

// Client → Server messages (validated at runtime via Zod in wsServer.ts)
export type WsClientMessage =
  | { type: "AUTH"; token: string }
  | { type: "PING" }
  | { type: "PONG" };
