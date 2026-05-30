import { Prisma, TeamRole } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import { getRole } from "./teamService";
import {
  publishTeamMemberLeft,
  publishTeamMemberRoleChanged,
} from "./teamEventService";
import type { UpdateMemberRoleInput } from "../validators/teamSchema";

// Public projection for member rows. Never includes isDeleted/deletedAt.
// User.email is plaintext (login identifier) and is exposed to fellow
// teammates the same way Slack/Linear/Notion surface workspace directories.
const memberPublicSelect = {
  id: true,
  role: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.TeamMemberSelect;

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

// Generic 404 message used for every "not a member / team missing / target
// missing" path. Identical body across endpoints kills the enumeration oracle.
const NOT_FOUND_MESSAGE = "Team or member not found";

// ── listMembers ───────────────────────────────────────────────────────────────

export async function listMembers(actorId: string, teamId: string) {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError(NOT_FOUND_MESSAGE, 404);

  const members = await prisma.teamMember.findMany({
    where: { teamId, isDeleted: false },
    select: memberPublicSelect,
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });

  // Prisma's enum sort follows declaration order (OWNER, ADMIN, MEMBER),
  // which is what we want, but sort defensively in JS to stay decoupled
  // from any future schema reordering.
  members.sort((a, b) => {
    const r = ROLE_RANK[b.role] - ROLE_RANK[a.role];
    if (r !== 0) return r;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  return members;
}

// ── changeMemberRole ──────────────────────────────────────────────────────────

export async function changeMemberRole(
  actorId: string,
  teamId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput,
) {
  const actorRole = await getRole(actorId, teamId);
  if (!actorRole) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (actorRole !== TeamRole.OWNER) {
    throw new AppError("Only the team owner can change member roles", 403);
  }
  if (targetUserId === actorId) {
    // Owner cannot demote self via this endpoint — would orphan the team.
    // Transfer-ownership is the only path that touches the owner record.
    throw new AppError(
      "Owners cannot change their own role here — use transfer-ownership instead",
      400,
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Row-lock the target member to serialise concurrent PATCHes. Without
      // this, two parallel PATCH calls would both pass the OWNER precheck and
      // race the final update. Using $queryRawUnsafe with parametrised values.
      await tx.$queryRaw`
        SELECT 1 FROM "TeamMember"
        WHERE "teamId" = ${teamId}::uuid
          AND "userId" = ${targetUserId}::uuid
          AND "isDeleted" = false
        FOR UPDATE
      `;

      const target = await tx.teamMember.findFirst({
        where: { teamId, userId: targetUserId, isDeleted: false },
        select: { id: true, role: true },
      });
      if (!target) throw new AppError(NOT_FOUND_MESSAGE, 404);

      // Belt-and-suspenders: target.role must NOT be OWNER. Caller-OWNER check
      // + self-block already cover the legitimate paths, but this enforces
      // "no path can change an OWNER record via this endpoint" as an
      // invariant at the mutation site itself.
      if (target.role === TeamRole.OWNER) {
        throw new AppError(
          "Cannot change the owner's role — use transfer-ownership instead",
          400,
        );
      }

      const updated = await tx.teamMember.update({
        where: { id: target.id },
        data: { role: input.role },
        select: memberPublicSelect,
      });

      return updated;
    },
    { timeout: 15000 },
  );

  // Phase 6 P7 — fan-out role change to all active team members. Actor
  // is excluded (they have the result in the HTTP response).
  await publishTeamMemberRoleChanged(
    { teamId, userId: targetUserId, role: input.role },
    { excludeUserId: actorId },
  ).catch((err) => {
    logger.warn("teamMemberService: TEAM_MEMBER_ROLE_CHANGED publish failed", {
      teamId,
      targetUserId,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  return result;
}

// ── removeMember ──────────────────────────────────────────────────────────────

export async function removeMember(
  actorId: string,
  teamId: string,
  targetUserId: string,
) {
  const actorRole = await getRole(actorId, teamId);
  if (!actorRole) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (ROLE_RANK[actorRole] < ROLE_RANK.ADMIN) {
    throw new AppError("Only admins or the owner can remove members", 403);
  }
  if (targetUserId === actorId) {
    throw new AppError(
      "Use DELETE /teams/:teamId/leave to leave the team",
      400,
    );
  }

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const target = await tx.teamMember.findFirst({
        where: { teamId, userId: targetUserId, isDeleted: false },
        select: { id: true, role: true },
      });
      if (!target) throw new AppError(NOT_FOUND_MESSAGE, 404);
      if (target.role === TeamRole.OWNER) {
        throw new AppError(
          "Owner cannot be removed — transfer ownership first",
          403,
        );
      }

      await tx.teamMember.update({
        where: { id: target.id },
        data: { isDeleted: true, deletedAt: now },
      });

      // Soft-delete Cards in this team that the removed user currently owns.
      // After transfer-ownership any ex-owner cards were reassigned to the new
      // owner (see teamService.transferOwnership), so this only touches cards
      // the target user personally added while a member.
      await tx.card.updateMany({
        where: { teamId, userId: targetUserId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
    },
    { timeout: 15000 },
  );

  logger.info("Team member removed", { teamId, actorId, targetUserId });

  // Phase 6 P7 — notify remaining active team members that the row is gone.
  // The departed user is no longer in the active list, so this naturally
  // excludes them. Fail-open.
  await publishTeamMemberLeft({
    teamId,
    userId: targetUserId,
    leftBy: "removed",
  }).catch((err) => {
    logger.warn(
      "teamMemberService: TEAM_MEMBER_LEFT publish failed (removed)",
      {
        teamId,
        targetUserId,
        err: err instanceof Error ? err.message : String(err),
      },
    );
  });
}

// ── leaveTeam ─────────────────────────────────────────────────────────────────

export async function leaveTeam(actorId: string, teamId: string) {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (role === TeamRole.OWNER) {
    throw new AppError(
      "Owners cannot leave their team — transfer ownership first",
      403,
    );
  }

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      // Re-verify the team still exists and isn't soft-deleted inside the tx
      // (closes a TOCTOU vs a concurrent deleteTeam call).
      const team = await tx.team.findFirst({
        where: { id: teamId, isDeleted: false },
        select: { id: true },
      });
      if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);

      await tx.teamMember.updateMany({
        where: { teamId, userId: actorId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });

      // Soft-delete the leaver's own team Cards (same scope as removeMember).
      await tx.card.updateMany({
        where: { teamId, userId: actorId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
    },
    { timeout: 15000 },
  );

  logger.info("Team member left", { teamId, actorId });

  // Phase 6 P7 — notify remaining members. Fail-open.
  await publishTeamMemberLeft({
    teamId,
    userId: actorId,
    leftBy: "self",
  }).catch((err) => {
    logger.warn("teamMemberService: TEAM_MEMBER_LEFT publish failed (self)", {
      teamId,
      actorId,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}
