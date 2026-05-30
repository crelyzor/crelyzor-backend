import crypto from "crypto";
import {
  publishTeamInviteReceived,
  publishTeamMemberJoined,
} from "./teamEventService";
import { Prisma, TeamRole } from "@prisma/client";
import prisma from "../db/prismaClient";
import { env } from "../config/environment";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import { normalizeEmail } from "../utils/security/normalize";
import { sendEmail } from "./email/emailService";
import { teamInviteTemplate } from "./email/templates/teamInvite";
import { getRole } from "./teamService";
import type { CreateInviteInput } from "../validators/teamSchema";

const NOT_FOUND_MESSAGE = "Team or invite not found";

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

const FALLBACK_MAX_MEMBERS = 50;
const FALLBACK_EXPIRY_DAYS = 7;

// ── helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function readSystemConfigNumber(
  key: string,
  fallback: number,
): Promise<number> {
  const row = await prisma.systemConfig.findUnique({
    where: { key },
    select: { value: true },
  });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Postgres advisory lock keyed on teamId — invite creation is a team-wide
// invariant (member-cap), so locking the team scope (not the actor) is what
// the cap actually protects.
async function withTeamAdvisoryLock<T>(
  tx: Prisma.TransactionClient,
  teamId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = teamIdToBigInt(teamId);
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);
  return fn();
}

function teamIdToBigInt(teamId: string): string {
  const digest = crypto.createHash("sha256").update(`team:${teamId}`).digest();
  const buf = Buffer.from(digest.subarray(0, 8));
  buf[0] &= 0x7f;
  return buf.readBigInt64BE(0).toString();
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function buildAcceptUrl(token: string): string {
  return `${env.PUBLIC_URL.replace(/\/$/, "")}/invite/${token}`;
}

// ── projections ──────────────────────────────────────────────────────────────

// Admin-side projection — exposes invite metadata for the team-management UI.
// Never exposes `token` (sending it back to the API would defeat the URL-only
// delivery model) or the `userId` of the recipient (would leak account
// existence to whomever can see the invite list).
const invitePublicSelect = {
  id: true,
  teamId: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  invitedBy: { select: { id: true, name: true } },
} satisfies Prisma.TeamInviteSelect;

// ── createInvites ────────────────────────────────────────────────────────────

interface CreateInviteResult {
  created: Array<{
    invite: Prisma.TeamInviteGetPayload<{ select: typeof invitePublicSelect }>;
    emailSent: boolean;
  }>;
  skipped: Array<{
    email: string;
    reason: "already_invited" | "already_member" | "user_inactive";
  }>;
}

export async function createInvites(
  actorId: string,
  teamId: string,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const actorRole = await getRole(actorId, teamId);
  if (!actorRole) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (ROLE_RANK[actorRole] < ROLE_RANK.ADMIN) {
    throw new AppError("Only admins or the owner can invite members", 403);
  }

  // Resolve the prospective invitee email set (mode=email is already an array;
  // mode=user resolves the target's email).
  let prospectiveEmails: Array<{
    email: string;
    targetUserId: string | null;
  }> = [];

  if (input.mode === "user") {
    const target = await prisma.user.findFirst({
      where: { id: input.userId, isDeleted: false, isActive: true },
      select: { id: true, email: true },
    });
    if (!target) {
      throw new AppError("Target user not found or inactive", 404);
    }
    prospectiveEmails = [
      { email: normalizeEmail(target.email), targetUserId: target.id },
    ];
  } else {
    // Mode=email: normalize + dedupe.
    const seen = new Set<string>();
    for (const raw of input.emails) {
      const norm = normalizeEmail(raw);
      if (seen.has(norm)) continue;
      seen.add(norm);
      prospectiveEmails.push({ email: norm, targetUserId: null });
    }
  }

  const result = await prisma.$transaction(
    async (tx) => {
      return withTeamAdvisoryLock(tx, teamId, async () => {
        // Re-resolve the cap and expiry under the lock so concurrent invite
        // batches serialise behind a consistent quota.
        const [maxMembers, expiryDays] = await Promise.all([
          readSystemConfigNumber("max_members_per_team", FALLBACK_MAX_MEMBERS),
          readSystemConfigNumber(
            "team_invite_expiry_days",
            FALLBACK_EXPIRY_DAYS,
          ),
        ]);

        const [activeMemberCount, openInviteCount] = await Promise.all([
          tx.teamMember.count({ where: { teamId, isDeleted: false } }),
          tx.teamInvite.count({
            where: {
              teamId,
              isDeleted: false,
              acceptedAt: null,
              declinedAt: null,
              cancelledAt: null,
            },
          }),
        ]);

        const totalSlots = activeMemberCount + openInviteCount;

        // Pre-check duplicates so we can return a deterministic
        // {created, skipped} payload instead of relying on a partial P2002.
        const existingMembers = await tx.teamMember.findMany({
          where: {
            teamId,
            isDeleted: false,
            user: { email: { in: prospectiveEmails.map((p) => p.email) } },
          },
          select: { user: { select: { email: true } } },
        });
        const existingMemberEmails = new Set(
          existingMembers.map((m) => normalizeEmail(m.user.email)),
        );

        const existingOpenInvites = await tx.teamInvite.findMany({
          where: {
            teamId,
            isDeleted: false,
            acceptedAt: null,
            declinedAt: null,
            cancelledAt: null,
            email: { in: prospectiveEmails.map((p) => p.email) },
          },
          select: { email: true },
        });
        const existingInviteEmails = new Set(
          existingOpenInvites.map((i) => i.email),
        );

        const skipped: CreateInviteResult["skipped"] = [];
        const toCreate: Array<{
          email: string;
          targetUserId: string | null;
        }> = [];

        for (const p of prospectiveEmails) {
          if (existingMemberEmails.has(p.email)) {
            skipped.push({ email: p.email, reason: "already_member" });
            continue;
          }
          if (existingInviteEmails.has(p.email)) {
            skipped.push({ email: p.email, reason: "already_invited" });
            continue;
          }
          toCreate.push(p);
        }

        if (totalSlots + toCreate.length > maxMembers) {
          throw new AppError(
            `Team would exceed the maximum of ${maxMembers} members (active + pending invites)`,
            409,
          );
        }

        const expiresAt = new Date(
          Date.now() + expiryDays * 24 * 60 * 60 * 1000,
        );

        const created: Array<{
          invite: Prisma.TeamInviteGetPayload<{
            select: typeof invitePublicSelect;
          }>;
          email: string;
        }> = [];

        for (const p of toCreate) {
          const token = generateToken();
          const invite = await tx.teamInvite
            .create({
              data: {
                teamId,
                email: p.email,
                userId: p.targetUserId,
                role: input.mode === "user" ? input.role : input.role,
                token,
                invitedById: actorId,
                expiresAt,
              },
              select: invitePublicSelect,
            })
            .catch((err: unknown) => {
              // Safety net: partial unique index race. Treat as "already invited"
              // skip rather than 500 the whole batch.
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "23505" /* unique violation */
              ) {
                return null;
              }
              throw err;
            });
          if (invite === null) {
            skipped.push({ email: p.email, reason: "already_invited" });
            continue;
          }
          // Store the raw token next to the projection — we never return it
          // from the API, only use it to build the email URL out of band.
          created.push({ invite, email: p.email });
        }

        return { created, skipped };
      });
    },
    { timeout: 15000 },
  );

  // Tokens needed for emails — fetch them once outside the tx to keep the
  // tx tight. Joining by id is single-row indexed lookups.
  const inviteIds = result.created.map((c) => c.invite.id);
  const tokenRows = inviteIds.length
    ? await prisma.teamInvite.findMany({
        where: { id: { in: inviteIds } },
        select: {
          id: true,
          token: true,
          // Phase 6 P7 — userId needed to publish TEAM_INVITE_RECEIVED on
          // user-mode invites; null for email-only invites (skipped below).
          userId: true,
          expiresAt: true,
          team: { select: { name: true } },
          invitedBy: { select: { name: true } },
          email: true,
          role: true,
        },
      })
    : [];
  const tokenByInviteId = new Map(tokenRows.map((r) => [r.id, r]));

  const createdWithStatus: CreateInviteResult["created"] = [];
  for (const c of result.created) {
    const row = tokenByInviteId.get(c.invite.id);
    let emailSent = false;
    if (row) {
      try {
        emailSent = await sendEmail({
          to: row.email,
          subject: `${firstName(row.invitedBy.name)} invited you to ${row.team.name}`,
          html: teamInviteTemplate({
            inviterName: row.invitedBy.name,
            teamName: row.team.name,
            // Invite.role is constrained to ADMIN|MEMBER at the validator + DB level
            // (Zod enum + no service path that writes OWNER), but Prisma types it as
            // the full TeamRole. Narrow defensively at the email boundary.
            role: row.role === "OWNER" ? "ADMIN" : row.role,
            acceptUrl: buildAcceptUrl(row.token),
            message: input.message,
          }),
        });
      } catch (err) {
        logger.warn("teamInviteService: invite email failed", {
          inviteId: c.invite.id,
          err,
        });
        emailSent = false;
      }
    }
    createdWithStatus.push({ invite: c.invite, emailSent });

    // Phase 6 P7 — fire TEAM_INVITE_RECEIVED to the invitee's open tabs
    // when the invite is bound to an existing user account. Email-only
    // invites (no userId) have no recipient to push to.
    if (row?.userId) {
      try {
        publishTeamInviteReceived(row.userId, {
          invite: {
            id: c.invite.id,
            teamId: c.invite.teamId,
            teamName: row.team.name,
            role: row.role === "OWNER" ? "ADMIN" : row.role,
            invitedByName: row.invitedBy.name,
            expiresAt: row.expiresAt,
          },
        });
      } catch (err) {
        logger.warn("teamInviteService: WS publish failed (non-fatal)", {
          inviteId: c.invite.id,
          err,
        });
      }
    }
  }

  logger.info("Team invites created", {
    teamId,
    actorId,
    createdCount: createdWithStatus.length,
    skippedCount: result.skipped.length,
  });

  return { created: createdWithStatus, skipped: result.skipped };
}

// ── listInvites ──────────────────────────────────────────────────────────────

export async function listInvites(actorId: string, teamId: string) {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (ROLE_RANK[role] < ROLE_RANK.ADMIN) {
    throw new AppError("Only admins or the owner can list invites", 403);
  }

  return prisma.teamInvite.findMany({
    where: {
      teamId,
      isDeleted: false,
      acceptedAt: null,
      declinedAt: null,
      cancelledAt: null,
    },
    select: invitePublicSelect,
    orderBy: { createdAt: "desc" },
  });
}

// ── listMyPendingInvites ─────────────────────────────────────────────────────
// Phase 6 P13 — invitee-side discovery. The actor is the invitee; we list only
// invites that are bound to their account (userId match), still pending, and
// not expired. Never exposes `token` (URL-delivery) or `email` (it's their own
// address, but irrelevant for the panel).
export async function listMyPendingInvites(userId: string) {
  return prisma.teamInvite.findMany({
    where: {
      userId,
      isDeleted: false,
      acceptedAt: null,
      declinedAt: null,
      cancelledAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      team: {
        select: { id: true, name: true, slug: true, logoUrl: true },
      },
      invitedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ── resendInvite ─────────────────────────────────────────────────────────────

export async function resendInvite(
  actorId: string,
  teamId: string,
  inviteId: string,
) {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (ROLE_RANK[role] < ROLE_RANK.ADMIN) {
    throw new AppError("Only admins or the owner can resend invites", 403);
  }

  const expiryDays = await readSystemConfigNumber(
    "team_invite_expiry_days",
    FALLBACK_EXPIRY_DAYS,
  );
  const newExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const invite = await prisma.$transaction(async (tx) => {
    const row = await tx.teamInvite.findFirst({
      where: {
        id: inviteId,
        teamId,
        isDeleted: false,
        acceptedAt: null,
        declinedAt: null,
        cancelledAt: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        token: true,
        team: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!row) throw new AppError(NOT_FOUND_MESSAGE, 404);

    await tx.teamInvite.update({
      where: { id: row.id },
      data: { expiresAt: newExpiresAt },
    });

    return row;
  });

  let emailSent = false;
  try {
    emailSent = await sendEmail({
      to: invite.email,
      subject: `Reminder: ${firstName(invite.invitedBy.name)} invited you to ${invite.team.name}`,
      html: teamInviteTemplate({
        inviterName: invite.invitedBy.name,
        teamName: invite.team.name,
        // Same defensive narrowing as in createInvites — invite.role is
        // ADMIN|MEMBER at the validator level, but typed as the full TeamRole.
        role: invite.role === "OWNER" ? "ADMIN" : invite.role,
        acceptUrl: buildAcceptUrl(invite.token),
      }),
    });
  } catch (err) {
    logger.warn("teamInviteService: resend email failed", {
      inviteId,
      err,
    });
  }

  const fresh = await prisma.teamInvite.findUnique({
    where: { id: inviteId },
    select: invitePublicSelect,
  });
  return { invite: fresh, emailSent };
}

// ── cancelInvite ─────────────────────────────────────────────────────────────

export async function cancelInvite(
  actorId: string,
  teamId: string,
  inviteId: string,
) {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (ROLE_RANK[role] < ROLE_RANK.ADMIN) {
    throw new AppError("Only admins or the owner can cancel invites", 403);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const row = await tx.teamInvite.findFirst({
      where: { id: inviteId, teamId, isDeleted: false },
      select: { id: true, acceptedAt: true },
    });
    if (!row) throw new AppError(NOT_FOUND_MESSAGE, 404);
    if (row.acceptedAt) {
      throw new AppError(
        "Cannot cancel an accepted invite — remove the member instead",
        400,
      );
    }
    await tx.teamInvite.update({
      where: { id: row.id },
      data: { cancelledAt: now, isDeleted: true, deletedAt: now },
    });
  });

  logger.info("Team invite cancelled", { teamId, inviteId, actorId });
}

// ── getInviteByToken (public, no auth) ───────────────────────────────────────

export async function getInviteByToken(token: string) {
  const invite = await prisma.teamInvite.findFirst({
    where: {
      token,
      isDeleted: false,
      acceptedAt: null,
      declinedAt: null,
      cancelledAt: null,
    },
    select: {
      expiresAt: true,
      role: true,
      team: { select: { name: true, logoUrl: true, isDeleted: true } },
      invitedBy: { select: { name: true } },
    },
  });

  if (!invite || invite.team.isDeleted) {
    throw new AppError("Invite not found", 404);
  }
  if (invite.expiresAt < new Date()) {
    throw new AppError("Invite has expired", 410);
  }

  // Public projection: drop team.slug (tenant identifier; useful for
  // phishing pretexts if the link leaks) and reduce inviter to first name.
  // Never expose the invitee email — token holders shouldn't learn it.
  return {
    team: { name: invite.team.name, logoUrl: invite.team.logoUrl },
    role: invite.role,
    inviter: { name: firstName(invite.invitedBy.name) },
    expiresAt: invite.expiresAt,
  };
}

// ── acceptance helpers ───────────────────────────────────────────────────────

interface InviteForAcceptance {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  userId: string | null;
  expiresAt: Date;
}

async function findOpenInviteByToken(
  tx: Prisma.TransactionClient,
  token: string,
): Promise<InviteForAcceptance | null> {
  return tx.teamInvite.findFirst({
    where: {
      token,
      isDeleted: false,
      acceptedAt: null,
      declinedAt: null,
      cancelledAt: null,
    },
    select: {
      id: true,
      teamId: true,
      email: true,
      role: true,
      userId: true,
      expiresAt: true,
    },
  });
}

async function findOpenInviteByTeam(
  tx: Prisma.TransactionClient,
  teamId: string,
  actorId: string,
  actorEmail: string,
): Promise<InviteForAcceptance | null> {
  return tx.teamInvite.findFirst({
    where: {
      teamId,
      isDeleted: false,
      acceptedAt: null,
      declinedAt: null,
      cancelledAt: null,
      OR: [{ email: actorEmail }, { userId: actorId }],
    },
    select: {
      id: true,
      teamId: true,
      email: true,
      role: true,
      userId: true,
      expiresAt: true,
    },
  });
}

async function acceptInviteCore(
  actorId: string,
  actorEmail: string,
  actorName: string,
  invite: InviteForAcceptance,
  tx: Prisma.TransactionClient,
): Promise<{ teamId: string; teamSlug: string; teamName: string }> {
  if (invite.expiresAt < new Date()) {
    throw new AppError("Invite has expired", 410);
  }
  // Email-match guard: the inviter chose who could accept. Lifting a token
  // from another person's inbox should not let you join. mode=user invites
  // also carry the recipient's email; mode=email obviously does.
  if (invite.email !== actorEmail) {
    throw new AppError("This invite isn't addressed to your account", 403);
  }

  await tx.teamInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  // Re-join semantics — flip isDeleted on an existing soft-deleted membership
  // while preserving the original joinedAt for audit history. New members
  // get a fresh row.
  const existing = await tx.teamMember.findUnique({
    where: { teamId_userId: { teamId: invite.teamId, userId: actorId } },
    select: { id: true, isDeleted: true },
  });

  if (existing) {
    await tx.teamMember.update({
      where: { id: existing.id },
      data: existing.isDeleted
        ? { isDeleted: false, deletedAt: null, role: invite.role }
        : { role: invite.role },
    });
  } else {
    await tx.teamMember.create({
      data: {
        teamId: invite.teamId,
        userId: actorId,
        role: invite.role,
      },
    });
  }

  const team = await tx.team.findUnique({
    where: { id: invite.teamId },
    select: { slug: true, name: true },
  });
  if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);

  logger.info("Team invite accepted", {
    teamId: invite.teamId,
    inviteId: invite.id,
    actorId,
    actorName,
  });

  return { teamId: invite.teamId, teamSlug: team.slug, teamName: team.name };
}

/**
 * Phase 6 P7 — fire TEAM_MEMBER_JOINED to all active members of the team
 * after a successful invite acceptance. Excludes the new joiner from the
 * fan-out via opts.excludeUserId so they don't get a "you joined yourself"
 * toast — their UI already knows from the HTTP response.
 *
 * Fail-open: errors logged, never thrown.
 */
async function publishMemberJoinedAfterAccept(
  actorId: string,
  teamId: string,
): Promise<void> {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { teamId, userId: actorId, isDeleted: false },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!member) return;
    await publishTeamMemberJoined(
      {
        teamId,
        member: {
          id: member.id,
          role: member.role,
          user: member.user,
        },
      },
      { excludeUserId: actorId },
    );
  } catch (err) {
    logger.warn("teamInviteService: TEAM_MEMBER_JOINED publish failed", {
      teamId,
      actorId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function tryCreateMemberTeamCard(
  actorId: string,
  teamId: string,
  teamSlug: string,
  teamName: string,
) {
  try {
    await prisma.card.create({
      data: {
        userId: actorId,
        teamId,
        slug: `team-${teamSlug}`,
        displayName: teamName,
        isActive: true,
        isDefault: false,
      },
      select: { id: true },
    });
  } catch (err) {
    logger.warn("teamInviteService: auto member team-card creation failed", {
      teamId,
      actorId,
      err,
    });
  }
}

async function loadActor(actorId: string) {
  const actor = await prisma.user.findFirst({
    where: { id: actorId, isDeleted: false, isActive: true },
    select: { id: true, email: true, name: true },
  });
  if (!actor) throw new AppError("User not found", 401);
  return { ...actor, email: normalizeEmail(actor.email) };
}

// ── public-token accept/decline ──────────────────────────────────────────────

export async function acceptInviteByToken(actorId: string, token: string) {
  const actor = await loadActor(actorId);

  const ctx = await prisma.$transaction(
    async (tx) => {
      const invite = await findOpenInviteByToken(tx, token);
      if (!invite) throw new AppError("Invite not found", 404);
      return acceptInviteCore(actorId, actor.email, actor.name, invite, tx);
    },
    { timeout: 15000 },
  );

  await tryCreateMemberTeamCard(
    actorId,
    ctx.teamId,
    ctx.teamSlug,
    ctx.teamName,
  );
  // Phase 6 P7 — fan-out membership change to other active team members.
  await publishMemberJoinedAfterAccept(actorId, ctx.teamId);
  return { teamId: ctx.teamId };
}

export async function declineInviteByToken(actorId: string, token: string) {
  const actor = await loadActor(actorId);

  await prisma.$transaction(async (tx) => {
    const invite = await findOpenInviteByToken(tx, token);
    if (!invite) throw new AppError("Invite not found", 404);
    if (invite.email !== actor.email) {
      throw new AppError("This invite isn't addressed to your account", 403);
    }
    const now = new Date();
    await tx.teamInvite.update({
      where: { id: invite.id },
      data: { declinedAt: now, isDeleted: true, deletedAt: now },
    });
  });

  logger.info("Team invite declined (by token)", { actorId });
}

// ── in-app accept/decline (by teamId) ────────────────────────────────────────

export async function acceptInviteByTeam(actorId: string, teamId: string) {
  const actor = await loadActor(actorId);

  const ctx = await prisma.$transaction(
    async (tx) => {
      const invite = await findOpenInviteByTeam(
        tx,
        teamId,
        actor.id,
        actor.email,
      );
      if (!invite) throw new AppError(NOT_FOUND_MESSAGE, 404);
      return acceptInviteCore(actorId, actor.email, actor.name, invite, tx);
    },
    { timeout: 15000 },
  );

  await tryCreateMemberTeamCard(
    actorId,
    ctx.teamId,
    ctx.teamSlug,
    ctx.teamName,
  );
  // Phase 6 P7 — fan-out membership change to other active team members.
  await publishMemberJoinedAfterAccept(actorId, ctx.teamId);
  return { teamId: ctx.teamId };
}

export async function declineInviteByTeam(actorId: string, teamId: string) {
  const actor = await loadActor(actorId);

  await prisma.$transaction(async (tx) => {
    const invite = await findOpenInviteByTeam(
      tx,
      teamId,
      actor.id,
      actor.email,
    );
    if (!invite) throw new AppError(NOT_FOUND_MESSAGE, 404);
    const now = new Date();
    await tx.teamInvite.update({
      where: { id: invite.id },
      data: { declinedAt: now, isDeleted: true, deletedAt: now },
    });
  });

  logger.info("Team invite declined (by team)", { actorId, teamId });
}
