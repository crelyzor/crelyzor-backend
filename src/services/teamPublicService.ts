/**
 * Phase 6 P6 — Public team data layer.
 *
 * Three pure read functions for the public team-branded surface:
 *   - getPublicTeamProfile(slug)
 *   - getPublicTeamSchedulingProfile(slug)
 *   - getPublicTeamMemberSchedulingProfile(slug, username)
 *
 * All endpoints are no-auth. PII surfaced: name, username, avatarUrl, role.
 * NO emails, NO settings, NO private workspace state.
 */
import { TeamRole } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";

const NOT_FOUND_MESSAGE = "Team not found";

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

export interface PublicTeamMember {
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  role: TeamRole;
  teamCard: {
    slug: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface PublicTeamProfile {
  team: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    createdAt: Date;
  };
  members: PublicTeamMember[];
  stats: { memberCount: number };
}

/**
 * GET /public/teams/:slug — full team profile.
 *
 * Excludes soft-deleted teams + soft-deleted members. Each member's
 * team-scoped Card is included if one exists; null otherwise.
 */
export async function getPublicTeamProfile(
  slug: string,
): Promise<PublicTeamProfile> {
  const team = await prisma.team.findFirst({
    where: { slug, isDeleted: false },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      createdAt: true,
    },
  });
  if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);

  const members = await prisma.teamMember.findMany({
    where: { teamId: team.id, isDeleted: false },
    select: {
      role: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          isDeleted: true,
          cards: {
            where: { teamId: team.id, isDeleted: false, isActive: true },
            select: { slug: true, displayName: true, avatarUrl: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  // Filter active users + flatten the team card join.
  const activeMembers: PublicTeamMember[] = members
    .filter((m) => !m.user.isDeleted)
    .map((m) => ({
      user: {
        id: m.user.id,
        name: m.user.name,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
      },
      role: m.role,
      teamCard: m.user.cards[0]
        ? {
            slug: m.user.cards[0].slug,
            displayName: m.user.cards[0].displayName,
            avatarUrl: m.user.cards[0].avatarUrl,
          }
        : null,
    }))
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]);

  return {
    team,
    members: activeMembers,
    stats: { memberCount: activeMembers.length },
  };
}

export interface PublicTeamSchedulingMember {
  user: {
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  eventTypeCount: number;
}

export interface PublicTeamSchedulingProfile {
  team: {
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
  };
  members: PublicTeamSchedulingMember[];
}

/**
 * GET /public/scheduling/team/:slug/profile — list bookable members.
 *
 * A "bookable" member has at least one active team-scoped EventType. Members
 * without team event types are omitted so the guest UI doesn't show dead
 * tiles.
 */
export async function getPublicTeamSchedulingProfile(
  slug: string,
): Promise<PublicTeamSchedulingProfile> {
  const team = await prisma.team.findFirst({
    where: { slug, isDeleted: false },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
    },
  });
  if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);

  // Active members + their team event type counts in one pass.
  const members = await prisma.teamMember.findMany({
    where: { teamId: team.id, isDeleted: false },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          isDeleted: true,
          settings: { select: { schedulingEnabled: true } },
          eventTypes: {
            where: { teamId: team.id, isActive: true, isDeleted: false },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const bookable: PublicTeamSchedulingMember[] = members
    .filter(
      (m) =>
        !m.user.isDeleted &&
        m.user.username &&
        m.user.settings?.schedulingEnabled &&
        m.user.eventTypes.length > 0,
    )
    .map((m) => ({
      user: {
        name: m.user.name,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
      },
      eventTypeCount: m.user.eventTypes.length,
    }));

  return {
    team: {
      name: team.name,
      slug: team.slug,
      description: team.description,
      logoUrl: team.logoUrl,
    },
    members: bookable,
  };
}

export interface PublicTeamMemberSchedulingProfile {
  team: { name: string; slug: string; logoUrl: string | null };
  user: {
    name: string | null;
    username: string;
    avatarUrl: string | null;
    timezone: string | null;
  };
  eventTypes: Array<{
    id: string;
    title: string;
    slug: string;
    description: string | null;
    duration: number;
    locationType: string;
  }>;
}

/**
 * GET /public/scheduling/team/:slug/:username — specific member's team event types.
 *
 * 404 if:
 *   - team missing/soft-deleted
 *   - user missing/soft-deleted/no username
 *   - user is not an active member of the team
 *   - user has scheduling disabled
 *
 * Event types are team-scoped only (filtered by `teamId = team.id`).
 */
export async function getPublicTeamMemberSchedulingProfile(
  slug: string,
  username: string,
): Promise<PublicTeamMemberSchedulingProfile> {
  const team = await prisma.team.findFirst({
    where: { slug, isDeleted: false },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });
  if (!team) throw new AppError(NOT_FOUND_MESSAGE, 404);

  const user = await prisma.user.findFirst({
    where: { username, isDeleted: false },
    select: {
      id: true,
      name: true,
      username: true,
      avatarUrl: true,
      timezone: true,
      settings: { select: { schedulingEnabled: true } },
    },
  });
  if (!user || !user.username) throw new AppError(NOT_FOUND_MESSAGE, 404);
  if (!user.settings?.schedulingEnabled) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }

  const membership = await prisma.teamMember.findFirst({
    where: { teamId: team.id, userId: user.id, isDeleted: false },
    select: { id: true },
  });
  if (!membership) throw new AppError(NOT_FOUND_MESSAGE, 404);

  const eventTypes = await prisma.eventType.findMany({
    where: {
      userId: user.id,
      teamId: team.id,
      isActive: true,
      isDeleted: false,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      duration: true,
      locationType: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    team: { name: team.name, slug: team.slug, logoUrl: team.logoUrl },
    user: {
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
    },
    eventTypes,
  };
}
