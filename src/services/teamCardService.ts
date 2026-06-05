import { Prisma, TeamRole } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { getRole } from "./teamService";

const cardSelect = {
  id: true,
  userId: true,
  teamId: true,
  slug: true,
  displayName: true,
  title: true,
  bio: true,
  avatarUrl: true,
  coverUrl: true,
  links: true,
  contactFields: true,
  theme: true,
  templateId: true,
  showQr: true,
  htmlContent: true,
  htmlBackContent: true,
  isDefault: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CardSelect;

export type TeamCardRow = Prisma.CardGetPayload<{ select: typeof cardSelect }>;

export interface TeamCardEntry {
  member: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    designation: string | null;
  };
  role: TeamRole;
  cards: TeamCardRow[];
}

// All team members (OWNER, ADMIN, MEMBER) see all cards in the team.
// The per-card canEdit logic is enforced on the frontend (userId match for member cards, ADMIN+ for team card).
export async function getTeamCards(
  teamId: string,
  actorId: string,
): Promise<{ memberCards: TeamCardEntry[] }> {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError("Team not found", 404);

  const [allCards, allMembers] = await Promise.all([
    prisma.card.findMany({
      where: { teamId, isDeleted: false },
      select: cardSelect,
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMember.findMany({
      where: { teamId, isDeleted: false },
      select: {
        role: true,
        designation: true,
        userId: true,
        user: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const cardByUserId = new Map<string, TeamCardRow>();
  for (const c of allCards) {
    cardByUserId.set(c.userId, c);
  }

  const memberCards: TeamCardEntry[] = allMembers.map((m) => ({
    member: { ...m.user, designation: m.designation },
    role: m.role,
    cards: cardByUserId.has(m.userId) ? [cardByUserId.get(m.userId)!] : [],
  }));

  return { memberCards };
}
