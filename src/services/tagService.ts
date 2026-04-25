import { Prisma } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import type { CreateTagInput, UpdateTagInput } from "../validators/tagSchema";
import { DEFAULT_TAG_COLOR } from "../validators/tagSchema";

const TAG_SELECT = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ────────────────────────────────────────────────────────────
// Tag CRUD
// ────────────────────────────────────────────────────────────

export async function listTags(userId: string) {
  const [tags, meetingCounts, cardCounts, taskCounts, contactCounts] =
    await Promise.all([
      prisma.tag.findMany({
        where: { userId, isDeleted: false },
        select: TAG_SELECT,
        orderBy: { name: "asc" },
      }),
      prisma.meetingTag.groupBy({
        by: ["tagId"],
        where: {
          tag: { userId, isDeleted: false },
          meeting: { createdById: userId, isDeleted: false },
        },
        _count: { _all: true },
      }),
      prisma.cardTag.groupBy({
        by: ["tagId"],
        where: {
          tag: { userId, isDeleted: false },
          card: { userId, isDeleted: false },
        },
        _count: { _all: true },
      }),
      prisma.taskTag.groupBy({
        by: ["tagId"],
        where: {
          tag: { userId, isDeleted: false },
          task: { userId, isDeleted: false },
        },
        _count: { _all: true },
      }),
      prisma.contactTag.groupBy({
        by: ["tagId"],
        where: {
          tag: { userId, isDeleted: false },
          contact: {
            userId,
            card: { userId, isDeleted: false },
          },
        },
        _count: { _all: true },
      }),
    ]);

  const meetingCountsByTag = new Map(
    meetingCounts.map((row) => [row.tagId, row._count._all]),
  );
  const cardCountsByTag = new Map(
    cardCounts.map((row) => [row.tagId, row._count._all]),
  );
  const taskCountsByTag = new Map(
    taskCounts.map((row) => [row.tagId, row._count._all]),
  );
  const contactCountsByTag = new Map(
    contactCounts.map((row) => [row.tagId, row._count._all]),
  );

  return tags.map((tag) => ({
    ...tag,
    _count: {
      meetingTags: meetingCountsByTag.get(tag.id) ?? 0,
      cardTags: cardCountsByTag.get(tag.id) ?? 0,
      taskTags: taskCountsByTag.get(tag.id) ?? 0,
      contactTags: contactCountsByTag.get(tag.id) ?? 0,
    },
  }));
}

export async function createTag(userId: string, data: CreateTagInput) {
  try {
    return await prisma.tag.create({
      data: {
        userId,
        name: data.name,
        color: data.color ?? DEFAULT_TAG_COLOR,
      },
      select: TAG_SELECT,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("A tag with this name already exists", 409);
    }
    throw err;
  }
}

export async function updateTag(
  userId: string,
  tagId: string,
  data: UpdateTagInput,
) {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!existing) throw new AppError("Tag not found", 404);

  try {
    return await prisma.tag.update({
      where: { id: tagId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
      },
      select: TAG_SELECT,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("A tag with this name already exists", 409);
    }
    throw err;
  }
}

export async function deleteTag(userId: string, tagId: string) {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!existing) throw new AppError("Tag not found", 404);

  // Remove junction rows + soft-delete the tag in a single transaction
  await prisma.$transaction(
    async (tx) => {
      await tx.meetingTag.deleteMany({ where: { tagId } });
      await tx.cardTag.deleteMany({ where: { tagId } });
      await tx.taskTag.deleteMany({ where: { tagId } });
      await tx.contactTag.deleteMany({ where: { tagId } });
      await tx.tag.update({
        where: { id: tagId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    },
    { timeout: 15000 },
  );
}

export async function getTagItems(userId: string, tagId: string) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, userId, isDeleted: false },
    select: TAG_SELECT,
  });

  if (!tag) {
    throw new AppError("Tag not found", 404);
  }

  const [meetingTags, cardTags, taskTags, contactTags] = await Promise.all([
    prisma.meetingTag.findMany({
      where: { tagId, meeting: { createdById: userId, isDeleted: false } },
      select: {
        meeting: {
          select: {
            id: true,
            title: true,
            startTime: true,
            type: true,
            status: true,
          },
        },
      },
      take: 100,
    }),
    prisma.cardTag.findMany({
      where: { tagId, card: { userId: userId, isDeleted: false } },
      select: {
        card: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            title: true,
            avatarUrl: true,
          },
        },
      },
      take: 100,
    }),
    prisma.taskTag.findMany({
      where: { tagId, task: { userId: userId, isDeleted: false } },
      select: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
          },
        },
      },
      take: 100,
    }),
    prisma.contactTag.findMany({
      where: {
        tagId,
        contact: { userId, card: { userId, isDeleted: false } },
      },
      select: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
            cardId: true,
          },
        },
      },
      take: 100,
    }),
  ]);

  const meetings = meetingTags.map((t) => t.meeting);
  const cards = cardTags.map((t) => t.card);
  const tasks = taskTags.map((t) => t.task);
  const contacts = contactTags.map((t) => t.contact);

  return {
    tag,
    meetings,
    cards,
    tasks,
    contacts,
    counts: {
      meetings: meetings.length,
      cards: cards.length,
      tasks: tasks.length,
      contacts: contacts.length,
      total: meetings.length + cards.length + tasks.length + contacts.length,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Meeting tags
// ────────────────────────────────────────────────────────────

async function verifyMeetingOwnership(meetingId: string, userId: string) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);
}

async function verifyTagOwnership(tagId: string, userId: string) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!tag) throw new AppError("Tag not found", 404);
}

export async function getMeetingTags(userId: string, meetingId: string) {
  await verifyMeetingOwnership(meetingId, userId);

  const rows = await prisma.meetingTag.findMany({
    where: { meetingId, tag: { isDeleted: false } },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToMeeting(
  userId: string,
  meetingId: string,
  tagId: string,
) {
  await verifyMeetingOwnership(meetingId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.meetingTag.upsert({
    where: { meetingId_tagId: { meetingId, tagId } },
    create: { meetingId, tagId },
    update: {},
  });

  logger.info("Tag attached to meeting", { meetingId, tagId, userId });
}

export async function detachTagFromMeeting(
  userId: string,
  meetingId: string,
  tagId: string,
) {
  await verifyMeetingOwnership(meetingId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.meetingTag.deleteMany({ where: { meetingId, tagId } });

  logger.info("Tag detached from meeting", { meetingId, tagId, userId });
}

// ────────────────────────────────────────────────────────────
// Card tags
// ────────────────────────────────────────────────────────────

async function verifyCardOwnership(cardId: string, userId: string) {
  const card = await prisma.card.findFirst({
    where: { id: cardId, userId, isActive: true, isDeleted: false },
    select: { id: true },
  });
  if (!card) throw new AppError("Card not found", 404);
}

export async function getCardTags(userId: string, cardId: string) {
  await verifyCardOwnership(cardId, userId);

  const rows = await prisma.cardTag.findMany({
    where: { cardId, tag: { isDeleted: false } },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToCard(
  userId: string,
  cardId: string,
  tagId: string,
) {
  await verifyCardOwnership(cardId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.cardTag.upsert({
    where: { cardId_tagId: { cardId, tagId } },
    create: { cardId, tagId },
    update: {},
  });

  logger.info("Tag attached to card", { cardId, tagId, userId });
}

export async function detachTagFromCard(
  userId: string,
  cardId: string,
  tagId: string,
) {
  await verifyCardOwnership(cardId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.cardTag.deleteMany({ where: { cardId, tagId } });

  logger.info("Tag detached from card", { cardId, tagId, userId });
}

// ────────────────────────────────────────────────────────────
// Task tags
// ────────────────────────────────────────────────────────────

async function verifyTaskOwnership(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!task) throw new AppError("Task not found", 404);
}

export async function getTaskTags(userId: string, taskId: string) {
  await verifyTaskOwnership(taskId, userId);

  const rows = await prisma.taskTag.findMany({
    where: { taskId, tag: { isDeleted: false } },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToTask(
  userId: string,
  taskId: string,
  tagId: string,
) {
  await verifyTaskOwnership(taskId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.taskTag.upsert({
    where: { taskId_tagId: { taskId, tagId } },
    create: { taskId, tagId },
    update: {},
  });

  logger.info("Tag attached to task", { taskId, tagId, userId });
}

export async function detachTagFromTask(
  userId: string,
  taskId: string,
  tagId: string,
) {
  await verifyTaskOwnership(taskId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.taskTag.deleteMany({ where: { taskId, tagId } });

  logger.info("Tag detached from task", { taskId, tagId, userId });
}

// ────────────────────────────────────────────────────────────
// Contact tags
// ────────────────────────────────────────────────────────────

async function verifyContactOwnership(contactId: string, userId: string) {
  const contact = await prisma.cardContact.findFirst({
    where: {
      id: contactId,
      card: {
        userId: userId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });
  if (!contact) throw new AppError("Contact not found", 404);
}

export async function getContactTags(userId: string, contactId: string) {
  await verifyContactOwnership(contactId, userId);

  const rows = await prisma.contactTag.findMany({
    where: {
      contactId,
      tag: { isDeleted: false },
      contact: {
        userId,
        card: { userId, isDeleted: false },
      },
    },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToContact(
  userId: string,
  contactId: string,
  tagId: string,
) {
  await verifyContactOwnership(contactId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId } },
    create: { contactId, tagId },
    update: {},
  });

  logger.info("Tag attached to contact", { contactId, tagId, userId });
}

export async function detachTagFromContact(
  userId: string,
  contactId: string,
  tagId: string,
) {
  await verifyContactOwnership(contactId, userId);
  await verifyTagOwnership(tagId, userId);

  await prisma.contactTag.deleteMany({ where: { contactId, tagId } });

  logger.info("Tag detached from contact", { contactId, tagId, userId });
}
