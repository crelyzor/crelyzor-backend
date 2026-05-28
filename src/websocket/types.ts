import WebSocket from "ws";

export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

export interface WsNotificationPayload {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

// Server → Client messages
export type WsServerMessage =
  | { type: "CONNECTED"; unreadCount: number }
  | { type: "NOTIFICATION"; data: WsNotificationPayload }
  | { type: "PING" }
  | { type: "PONG" };

// Client → Server messages (validated at runtime via Zod in wsServer.ts)
export type WsClientMessage =
  | { type: "AUTH"; token: string }
  | { type: "PING" }
  | { type: "PONG" };
