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

// Phase 6 P7 — team event payloads. Payloads stay minimal — frontends
// can re-fetch the team / invite / booking when they need deep state.
// The shape here covers what's needed for an immediate UI nudge (toast,
// badge update, list reorder).

export interface WsTeamInvitePayload {
  invite: {
    id: string;
    teamId: string;
    teamName: string;
    role: "ADMIN" | "MEMBER";
    invitedByName: string | null;
    expiresAt: Date;
  };
}

export interface WsTeamMemberJoinedPayload {
  teamId: string;
  member: {
    id: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    user: {
      id: string;
      name: string | null;
      username: string | null;
      avatarUrl: string | null;
    };
  };
}

export interface WsTeamMemberLeftPayload {
  teamId: string;
  userId: string;
  leftBy: "self" | "removed";
}

export interface WsTeamMemberRoleChangedPayload {
  teamId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}

export interface WsTeamMeetingBookedPayload {
  teamId: string;
  meetingId: string;
  bookingId: string;
  eventTypeTitle: string;
  guestName: string;
  startTime: Date;
}

// Server → Client messages
export type WsServerMessage =
  | { type: "CONNECTED"; unreadCount: number }
  | { type: "NOTIFICATION"; data: WsNotificationPayload }
  | { type: "TEAM_INVITE_RECEIVED"; data: WsTeamInvitePayload }
  | { type: "TEAM_MEMBER_JOINED"; data: WsTeamMemberJoinedPayload }
  | { type: "TEAM_MEMBER_LEFT"; data: WsTeamMemberLeftPayload }
  | { type: "TEAM_MEMBER_ROLE_CHANGED"; data: WsTeamMemberRoleChangedPayload }
  | { type: "TEAM_MEETING_BOOKED"; data: WsTeamMeetingBookedPayload }
  | { type: "PING" }
  | { type: "PONG" };

// Client → Server messages (validated at runtime via Zod in wsServer.ts)
export type WsClientMessage =
  | { type: "AUTH"; token: string }
  | { type: "PING" }
  | { type: "PONG" };
