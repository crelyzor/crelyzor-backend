import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";

const MEETING_SELECT = {
  id: true,
  title: true,
  type: true,
  status: true,
  startTime: true,
} as const;

const TASK_SELECT = {
  id: true,
  title: true,
  isCompleted: true,
  dueDate: true,
  priority: true,
  meetingId: true,
} as const;

const CARD_SELECT = {
  id: true,
  displayName: true,
  slug: true,
  title: true,
  avatarUrl: true,
} as const;

const CONTACT_SELECT = {
  id: true,
  name: true,
  email: true,
  company: true,
  cardId: true,
} as const;

export async function globalSearch(userId: string, q: string) {
  logger.info("Global search", { userId, q });

  const [meetings, tasks, cards, contacts] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        createdById: userId,
        isDeleted: false,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: MEETING_SELECT,
      take: 5,
      orderBy: { startTime: "desc" },
    }),

    prisma.task.findMany({
      where: {
        userId,
        isDeleted: false,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: TASK_SELECT,
      take: 5,
      orderBy: { createdAt: "desc" },
    }),

    prisma.card.findMany({
      where: {
        userId,
        isActive: true,
        isDeleted: false,
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      },
      select: CARD_SELECT,
      take: 5,
      orderBy: { createdAt: "desc" },
    }),

    prisma.cardContact.findMany({
      where: {
        card: {
          userId,
          isActive: true,
          isDeleted: false,
        },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
        ],
      },
      select: CONTACT_SELECT,
      take: 5,
      orderBy: { scannedAt: "desc" },
    }),
  ]);

  return { meetings, tasks, cards, contacts };
}
