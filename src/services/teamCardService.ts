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
  member: { id: string; name: string | null; avatarUrl: string | null };
  role: TeamRole;
  card: TeamCardRow | null;
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
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const ownerMember = allMembers.find((m) => m.role === "OWNER");
  if (!ownerMember) throw new AppError("Team not found", 404);
  const ownerId = ownerMember.userId;

  // Team card = owner's first card in this team (isDefault preferred)
  const teamCard = allCards.find((c) => c.userId === ownerId) ?? null;

  // Member cards = non-owner members only (owner is already represented by teamCard above)
  const cardByUserId = new Map(
    allCards.filter((c) => c.userId !== ownerId).map((c) => [c.userId, c]),
  );
  const memberCards: TeamCardEntry[] = allMembers
    .filter((m) => m.userId !== ownerId)
    .map((m) => ({
      member: m.user,
      role: m.role,
      card: cardByUserId.get(m.userId) ?? null,
    }));

  return { teamCard, memberCards };
}
