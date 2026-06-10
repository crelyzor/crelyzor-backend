import crypto from "crypto";
import { Prisma, TeamRole, Plan } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { logger } from "../utils/logging/logger";
import { generateAndWrapDek, prismaBytes } from "../utils/security/crypto";
import type {
  CreateTeamInput,
  UpdateTeamInput,
  TransferOwnershipInput,
} from "../validators/teamSchema";

// Public projection — never include wrappedDek, dekVersion, or soft-delete fields.
// All Team reads MUST flow through this select to avoid leaking encryption material.
export const teamPublicSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamSelect;

export type PublicTeam = Prisma.TeamGetPayload<{
  select: typeof teamPublicSelect;
}>;

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

const PLAN_LIMIT_KEY: Record<Exclude<Plan, "FREE">, string> = {
  PRO: "max_teams_per_pro_user",
  BUSINESS: "max_teams_per_business_user",
};

const FALLBACK_PLAN_LIMITS: Record<Exclude<Plan, "FREE">, number> = {
  PRO: 3,
  BUSINESS: 10,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the caller's role on a team, or null if (a) the team doesn't exist,
// (b) the team is soft-deleted, or (c) the caller is not an active member.
// Collapsing existence + membership into one null result kills the 403-vs-404
// enumeration oracle — every caller-not-allowed path returns 404 to outside callers.
export async function getRole(
  userId: string,
  teamId: string,
): Promise<TeamRole | null> {
  const member = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId,
      isDeleted: false,
      team: { isDeleted: false },
    },
    select: { role: true },
  });
  return member?.role ?? null;
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const existing = await prisma.team.findFirst({
    where: { slug, isDeleted: false },
    select: { id: true },
  });
  return existing === null;
}

async function readPlanLimit(plan: Exclude<Plan, "FREE">): Promise<number> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: PLAN_LIMIT_KEY[plan] },
    select: { value: true },
  });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : FALLBACK_PLAN_LIMITS[plan];
}

// Postgres advisory lock keyed on the actor's UUID. Two parallel POST /teams
// from the same user serialise behind this lock — closes the plan-limit TOCTOU
// gap without a serializable isolation level.
async function withUserAdvisoryLock<T>(
  tx: Prisma.TransactionClient,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = userIdToBigInt(userId);
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);
  return fn();
}

// Stable 63-bit signed bigint from a UUID — Postgres advisory locks need a bigint key.
function userIdToBigInt(userId: string): string {
  const digest = crypto.createHash("sha256").update(userId).digest();
  // Take the first 8 bytes, mask the sign bit so the value fits in a Postgres bigint.
  const buf = Buffer.from(digest.subarray(0, 8));
  buf[0] &= 0x7f;
  return buf.readBigInt64BE(0).toString();
}

// ── createTeam ────────────────────────────────────────────────────────────────

export async function createTeam(
  userId: string,
  input: CreateTeamInput,
): Promise<PublicTeam> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, isDeleted: true, isActive: true },
  });

  if (!user || user.isDeleted || !user.isActive) {
    throw ErrorFactory.unauthorized("User not found");
  }
  if (user.plan === Plan.FREE) {
    throw new AppError("Teams require a Pro or Business plan", 403);
  }

  // KMS wrap happens BEFORE the transaction — same pattern as initDekForNewUser.
  // Network I/O outside the tx avoids the 15s timeout pressure.
  // generateAndWrapDek zeroes rawDek on KMS failure; on success this caller
  // owns the buffer and zeroes it in the outer `finally` below (we never
  // need to decrypt during team create).
  const { rawDek, wrappedDek } = await generateAndWrapDek();

  let team: PublicTeam;
  try {
    team = await prisma.$transaction(
      async (tx) => {
        return withUserAdvisoryLock(tx, userId, async () => {
          // Re-validate quota inside the lock so concurrent creates serialise.
          const limit = await readPlanLimit(user.plan as Exclude<Plan, "FREE">);
          const ownedCount = await tx.team.count({
            where: { ownerId: userId, isDeleted: false },
          });
          if (ownedCount >= limit) {
            throw new AppError(
              `Plan limit reached: ${limit} team(s) for ${user.plan}`,
              403,
            );
          }

          const created = await tx.team
            .create({
              data: {
                name: input.name,
                slug: input.slug,
                description: input.description,
                logoUrl: input.logoUrl,
                ownerId: userId,
                wrappedDek: prismaBytes(wrappedDek),
                dekVersion: 1,
                members: {
                  create: { userId, role: TeamRole.OWNER },
                },
              },
              select: { ...teamPublicSelect, id: true },
            })
            .catch((err: unknown) => {
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              ) {
                throw ErrorFactory.conflict(
                  `Team slug "${input.slug}" is already taken`,
                );
              }
              throw err;
            });

          await tx.teamDekHistory.create({
            data: {
              teamId: created.id,
              version: 1,
              wrappedDek: prismaBytes(wrappedDek),
            },
          });

          return created;
        });
      },
      { timeout: 15000 },
    );
  } finally {
    // Wipe the raw DEK from memory whether the tx succeeded or rolled back —
    // we never need to decrypt during create, and a leaked rawDek on the heap
    // is the same risk surface either way.
    rawDek.fill(0);
  }

  logger.info("Team created", {
    teamId: team.id,
    ownerId: userId,
    slug: team.slug,
  });

  return team;
}

// ── listMyTeams ───────────────────────────────────────────────────────────────

export async function getTeamById(
  userId: string,
  teamId: string,
): Promise<PublicTeam & { owner: { id: string; name: string | null; email: string; plan: Plan } | null }> {
  const role = await getRole(userId, teamId);
  if (!role) throw ErrorFactory.notFound("Team");

  const team = await prisma.team.findUnique({
    where: { id: teamId, isDeleted: false },
    select: {
      ...teamPublicSelect,
      owner: {
        select: { id: true, name: true, email: true, plan: true },
      },
    },
  });

  if (!team) throw ErrorFactory.notFound("Team");
  return team;
}

export async function listMyTeams(
  userId: string,
): Promise<Array<{ role: TeamRole; team: PublicTeam }>> {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      isDeleted: false,
      team: { isDeleted: false },
    },
    select: {
      role: true,
      team: { select: teamPublicSelect },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships;
}

// ── updateTeam ────────────────────────────────────────────────────────────────

export async function updateTeam(
  userId: string,
  teamId: string,
  input: UpdateTeamInput,
): Promise<PublicTeam> {
  const role = await getRole(userId, teamId);
  if (!role) throw ErrorFactory.notFound("Team");
  if (ROLE_RANK[role] < ROLE_RANK.ADMIN) {
    throw new AppError(
      "Only team admins or the owner can update this team",
      403,
    );
  }
  // Slug change is OWNER-only, enforced in the service (Zod cannot express it).
  if (input.slug !== undefined && role !== TeamRole.OWNER) {
    throw new AppError("Only the team owner can change the slug", 403);
  }

  try {
    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      },
      select: teamPublicSelect,
    });
    return updated;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw ErrorFactory.conflict(`Team slug "${input.slug}" is already taken`);
    }
    throw err;
  }
}

// ── deleteTeam ────────────────────────────────────────────────────────────────

export async function deleteTeam(
  userId: string,
  teamId: string,
): Promise<void> {
  const role = await getRole(userId, teamId);
  if (!role) throw ErrorFactory.notFound("Team");
  if (role !== TeamRole.OWNER) {
    throw new AppError("Only the team owner can delete this team", 403);
  }

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: { isDeleted: true, deletedAt: now },
      });
      await tx.teamMember.updateMany({
        where: { teamId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
      await tx.card.updateMany({
        where: { teamId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
      // Hard delete + crypto-shred is handled by the retention job after the
      // configured soft-delete window. Do NOT cascade hard delete here.
    },
    { timeout: 15000 },
  );

  logger.info("Team soft-deleted", { teamId, ownerId: userId });
}

// ── transferOwnership ─────────────────────────────────────────────────────────

export async function transferOwnership(
  userId: string,
  teamId: string,
  input: TransferOwnershipInput,
): Promise<PublicTeam> {
  if (input.newOwnerId === userId) {
    throw new AppError("Cannot transfer ownership to yourself", 400);
  }

  const role = await getRole(userId, teamId);
  if (!role) throw ErrorFactory.notFound("Team");
  if (role !== TeamRole.OWNER) {
    throw new AppError("Only the team owner can transfer ownership", 403);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Load team inside the tx — teamNameConfirm must be compared to the live name.
      const team = await tx.team.findFirst({
        where: { id: teamId, isDeleted: false },
        select: { id: true, name: true, ownerId: true },
      });
      if (!team) throw ErrorFactory.notFound("Team");

      // Defensive: re-verify the caller is still the owner inside the tx.
      if (team.ownerId !== userId) {
        throw new AppError("Only the team owner can transfer ownership", 403);
      }

      if (team.name !== input.teamNameConfirm) {
        throw new AppError("Team name confirmation does not match", 400);
      }

      const target = await tx.teamMember.findFirst({
        where: {
          teamId,
          userId: input.newOwnerId,
          isDeleted: false,
          user: { isDeleted: false, isActive: true },
        },
        select: { userId: true },
      });
      if (!target) {
        throw new AppError(
          "Target user is not an active member of this team",
          404,
        );
      }

      const updated = await tx.team.update({
        where: { id: teamId },
        data: { ownerId: input.newOwnerId },
        select: teamPublicSelect,
      });

      // Demote old owner → ADMIN
      await tx.teamMember.update({
        where: { teamId_userId: { teamId, userId } },
        data: { role: TeamRole.ADMIN },
      });

      // Promote new owner → OWNER
      await tx.teamMember.update({
        where: { teamId_userId: { teamId, userId: input.newOwnerId } },
        data: { role: TeamRole.OWNER },
      });

      // Reassign team Cards to the new owner so they appear under the new owner's account.
      await tx.card.updateMany({
        where: { teamId, isDeleted: false },
        data: { userId: input.newOwnerId },
      });

      return updated;
    },
    { timeout: 15000 },
  );

  logger.info("Team ownership transferred", {
    teamId,
    fromUserId: userId,
    toUserId: input.newOwnerId,
  });

  return result;
}
