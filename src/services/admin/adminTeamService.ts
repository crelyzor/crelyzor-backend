/**
 * Phase 6 P8 — admin overrides for teams.
 *
 * Provides:
 *   - listTeams({include_deleted, search, page, pageSize}) — paginated list with owner email + memberCount.
 *   - getTeamDetail(teamId) — full detail incl. active + departed members and pending invites.
 *   - adminDeleteTeam(teamId, adminId) — soft-delete + cascade member/cards (same shape as Owner delete).
 */
import { Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { createLog } from "./adminAuditLogService";

const NOT_FOUND_MESSAGE = "Team not found";

interface ListOpts {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listTeams(opts: ListOpts) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.TeamWhereInput = {};
  if (!opts.include_deleted) where.isDeleted = false;
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.team.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        isDeleted: true,
        createdAt: true,
        owner: { select: { id: true, name: true, email: true, plan: true } },
        _count: { select: { members: { where: { isDeleted: false } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.team.count({ where }),
  ]);

  return {
    teams: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      logoUrl: r.logoUrl,
      isDeleted: r.isDeleted,
      createdAt: r.createdAt,
      owner: r.owner,
      memberCount: r._count.members,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getTeamDetail(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      isDeleted: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true, plan: true } },
      members: {
        select: {
          id: true,
          role: true,
          isDeleted: true,
          joinedAt: true,
          deletedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
      invites: {
        where: { isDeleted: false, acceptedAt: null, declinedAt: null },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);
  return team;
}

/**
 * Admin override soft-delete. Same cascade shape as `teamService.deleteTeam`
 * (owner soft-delete) — flips `isDeleted` on team, members, and team cards
 * in a transaction. Audit log captures the admin actor.
 */
export async function adminDeleteTeam(
  teamId: string,
  adminId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, slug: true, isDeleted: true },
  });
  if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (team.isDeleted) {
    // Re-delete is a no-op; treat as not found to keep the admin response clean.
    throw new AppError(NOT_FOUND_MESSAGE, 404);
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
    },
    { timeout: 15000 },
  );

  await createLog({
    action: "admin.team.delete",
    adminId,
    targetType: "team",
    targetId: teamId,
  });

  logger.info("admin.team.delete", {
    adminId,
    teamId: team.id,
    teamName: team.name,
    teamSlug: team.slug,
  });
}

export async function restoreTeam(teamId: string, adminId: string): Promise<void> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, isDeleted: true },
    select: { id: true },
  });
  if (!team) throw new AppError("Deleted team not found", 404);

  await prisma.$transaction(
    async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: { isDeleted: false, deletedAt: null },
      });
      await tx.teamMember.updateMany({
        where: { teamId, isDeleted: true },
        data: { isDeleted: false, deletedAt: null },
      });
    },
    { timeout: 15000 },
  );

  logger.info("admin.team.restore", { teamId, adminId });
}
