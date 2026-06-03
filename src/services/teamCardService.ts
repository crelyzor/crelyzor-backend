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
  isTeamCard: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CardSelect;

export type TeamCardRow = Prisma.CardGetPayload<{ select: typeof cardSelect }>;

export interface TeamCardEntry {
  member: { id: string; name: string | null; username: string | null; avatarUrl: string | null; designation: string | null };
  role: TeamRole;
  cards: TeamCardRow[];
}

// All team members (OWNER, ADMIN, MEMBER) see all cards in the team.
// The per-card canEdit logic is enforced on the frontend (userId match for member cards, ADMIN+ for team card).
export async function getTeamCards(
  teamId: string,
  actorId: string,
): Promise<{ teamCard: TeamCardRow | null; memberCards: TeamCardEntry[] }> {
  const role = await getRole(actorId, teamId);
  if (!role) throw new AppError("Team not found", 404);

  const [allCards, allMembers] = await Promise.all([
    prisma.card.findMany({
      where: { teamId, isDeleted: false },
      select: cardSelect,
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    prisma.teamMember.findMany({
      where: { teamId, isDeleted: false },
      select: {
        role: true,
        designation: true,
        userId: true,
        user: { select: { id: true, name: true, username: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  // Team card = the card explicitly designated with isTeamCard: true
  const teamCard = allCards.find((c) => c.isTeamCard) ?? null;

  // Member cards = per-member personal cards only (team card excluded)
  const cardsByUserId = new Map<string, TeamCardRow[]>();
  for (const c of allCards) {
    if (c.isTeamCard) continue;
    const list = cardsByUserId.get(c.userId) ?? [];
    list.push(c);
    cardsByUserId.set(c.userId, list);
  }
  const memberCards: TeamCardEntry[] = allMembers.map((m) => ({
    member: { ...m.user, designation: m.designation },
    role: m.role,
    cards: cardsByUserId.get(m.userId) ?? [],
  }));

  return { teamCard, memberCards };
}
