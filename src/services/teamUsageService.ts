/**
 * Phase 6 P5.8 — team usage breakdown service.
 *
 * Returns per-member consumption for the requested team plus an aggregate
 * summary and the team owner's plan limits (for in-context display).
 *
 * Access:
 *   - `getRole` is run by the caller (controller). Only ADMIN/OWNER is
 *     allowed at the route layer.
 *   - This module is the pure data layer — no role checks inside.
 */
import { TeamRole } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { getLimitsForPlan } from "./billing/usageService";

const TEAM_NOT_FOUND_MESSAGE = "Team not found";

export interface TeamUsageMemberRow {
  user: {
    id: string;
    name: string | null;
    email: string;
    username: string | null;
    avatarUrl: string | null;
  };
  role: TeamRole;
  transcriptionMinutes: number;
  recallHours: number;
  aiCredits: number;
  storageGb: number;
}

export interface TeamUsageResponse {
  team: { id: string; name: string; slug: string };
  summary: {
    transcriptionMinutes: number;
    recallHours: number;
    aiCredits: number;
    storageGb: number;
  };
  breakdown: TeamUsageMemberRow[];
  ownerLimits: {
    transcriptionMinutes: number;
    recallHours: number;
    aiCredits: number;
    storageGb: number;
  };
  periodStart: Date | null;
  resetAt: Date | null;
}

export async function getTeamUsage(teamId: string): Promise<TeamUsageResponse> {
  // Load the team + owner plan + members in parallel.
  const team = await prisma.team.findFirst({
    where: { id: teamId, isDeleted: false },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      owner: { select: { plan: true } },
    },
  });
  if (!team) throw new AppError(TEAM_NOT_FOUND_MESSAGE, 404);

  const [members, teamUsageRows] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId, isDeleted: false },
      select: {
        userId: true,
        role: true,
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
    }),
    // Every UserUsage row scoped to this team — one per member who has
    // actually consumed against the team. Members with no consumption yet
    // are filled with zeros below.
    prisma.userUsage.findMany({
      where: { teamId },
      select: {
        userId: true,
        transcriptionMinutesUsed: true,
        recallHoursUsed: true,
        aiCreditsUsed: true,
        storageGbUsed: true,
        periodStart: true,
        resetAt: true,
      },
    }),
  ]);

  const usageByUserId = new Map(teamUsageRows.map((r) => [r.userId, r]));

  const breakdown: TeamUsageMemberRow[] = members.map((m) => {
    const u = usageByUserId.get(m.userId);
    return {
      user: m.user,
      role: m.role,
      transcriptionMinutes: u?.transcriptionMinutesUsed ?? 0,
      recallHours: u?.recallHoursUsed ?? 0,
      aiCredits: u?.aiCreditsUsed ?? 0,
      storageGb: u?.storageGbUsed ?? 0,
    };
  });

  const summary = breakdown.reduce(
    (acc, row) => ({
      transcriptionMinutes: acc.transcriptionMinutes + row.transcriptionMinutes,
      recallHours: acc.recallHours + row.recallHours,
      aiCredits: acc.aiCredits + row.aiCredits,
      storageGb: acc.storageGb + row.storageGb,
    }),
    {
      transcriptionMinutes: 0,
      recallHours: 0,
      aiCredits: 0,
      storageGb: 0,
    },
  );

  const ownerLimits = getLimitsForPlan(team.owner.plan);

  // Take periodStart/resetAt from the first available team row. All rows
  // for the same team should share a cycle (created lazily on first
  // consumption + reset by the monthly cron together).
  const firstRow = teamUsageRows[0];

  return {
    team: { id: team.id, name: team.name, slug: team.slug },
    summary,
    breakdown,
    ownerLimits: {
      transcriptionMinutes: ownerLimits.transcriptionMinutes,
      recallHours: ownerLimits.recallHours,
      aiCredits: ownerLimits.aiCredits,
      storageGb: ownerLimits.storageGb,
    },
    periodStart: firstRow?.periodStart ?? null,
    resetAt: firstRow?.resetAt ?? null,
  };
}
