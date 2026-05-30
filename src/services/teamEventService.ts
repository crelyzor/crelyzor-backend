/**
 * Phase 6 P7 — Team WebSocket event fan-out.
 *
 * Thin wrapper around `publishToUser` that resolves the active member list
 * for a team and publishes a typed message to each. All calls are fire-
 * and-forget (Redis publish is already fail-open inside publishToUser);
 * caller is expected to invoke AFTER the DB commit so the receivers see
 * fresh state when they re-fetch.
 */
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";
import { publishToUser } from "../websocket/notificationSubscriber";
import type {
  WsServerMessage,
  WsTeamInvitePayload,
  WsTeamMemberJoinedPayload,
  WsTeamMemberLeftPayload,
  WsTeamMemberRoleChangedPayload,
  WsTeamMeetingBookedPayload,
} from "../websocket/types";

/**
 * Returns active member userIds for the team. Used by every fan-out path.
 * Cheap query — selects just userId, no relations.
 */
async function getActiveTeamMemberIds(teamId: string): Promise<string[]> {
  try {
    const rows = await prisma.teamMember.findMany({
      where: { teamId, isDeleted: false },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  } catch (err) {
    // Fail-open — return empty so caller's publish-loop is a no-op rather
    // than an exception bubbling up the post-commit hook.
    logger.warn("teamEventService: failed to load member list", {
      teamId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Fan-out a message to every active member of the team. Optionally exclude
 * one user (typically the actor who triggered the change — they already
 * have the result in the HTTP response).
 */
async function broadcastToTeam(
  teamId: string,
  msg: WsServerMessage,
  opts?: { excludeUserId?: string },
): Promise<void> {
  const memberIds = await getActiveTeamMemberIds(teamId);
  const excludeId = opts?.excludeUserId;
  for (const userId of memberIds) {
    if (excludeId && userId === excludeId) continue;
    publishToUser(userId, msg);
  }
}

// ── Public publishers (fire-and-forget) ──────────────────────────────────────

/**
 * Direct-message a single invitee. Only fires when the invite carries a
 * `userId` (the invitee already has an account); email-only invites have
 * no receiver and are skipped by the caller.
 */
export function publishTeamInviteReceived(
  inviteeUserId: string,
  data: WsTeamInvitePayload,
): void {
  publishToUser(inviteeUserId, { type: "TEAM_INVITE_RECEIVED", data });
}

/**
 * Notify all existing active team members that a new member joined.
 * The new joiner is included by default (they get the same event the
 * other members see, which their UI can use to confirm membership).
 * Callers can pass `excludeUserId` if they want to suppress the self-event.
 */
export async function publishTeamMemberJoined(
  data: WsTeamMemberJoinedPayload,
  opts?: { excludeUserId?: string },
): Promise<void> {
  await broadcastToTeam(
    data.teamId,
    { type: "TEAM_MEMBER_JOINED", data },
    opts,
  );
}

/**
 * Notify remaining team members that a member left (self-leave or admin-
 * removed). The departed user is no longer in the active member list, so
 * they don't get the event from this path — UI should drive the actor's
 * own departure from the HTTP response.
 */
export async function publishTeamMemberLeft(
  data: WsTeamMemberLeftPayload,
): Promise<void> {
  await broadcastToTeam(data.teamId, { type: "TEAM_MEMBER_LEFT", data });
}

/**
 * Notify all team members that a member's role changed. The actor (OWNER
 * who made the change) is excluded by default — they already know via the
 * HTTP response.
 */
export async function publishTeamMemberRoleChanged(
  data: WsTeamMemberRoleChangedPayload,
  opts?: { excludeUserId?: string },
): Promise<void> {
  await broadcastToTeam(
    data.teamId,
    { type: "TEAM_MEMBER_ROLE_CHANGED", data },
    opts,
  );
}

/**
 * Notify all team members that a team-scoped booking was confirmed. Drives
 * the team meeting list refresh + a subtle toast for awareness. Called
 * only when `booking.teamId !== null` (personal bookings skip this path).
 */
export async function publishTeamMeetingBooked(
  data: WsTeamMeetingBookedPayload,
): Promise<void> {
  await broadcastToTeam(data.teamId, { type: "TEAM_MEETING_BOOKED", data });
}
