import { LocationType, Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type {
  CreateEventTypeInput,
  UpdateEventTypeInput,
} from "../../validators/eventTypeSchema";

const EVENT_TYPE_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  duration: true,
  locationType: true,
  meetingLink: true,
  bufferBefore: true,
  bufferAfter: true,
  minNoticeHours: true,
  maxPerDay: true,
  isActive: true,
  availabilityScheduleId: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function verifyOwnership(id: string, userId: string) {
  const existing = await prisma.eventType.findFirst({
    where: { id, userId, isDeleted: false },
    select: { id: true, locationType: true, meetingLink: true },
  });
  if (!existing) throw new AppError("Event type not found", 404);
  return existing;
}

export async function listEventTypes(userId: string) {
  return prisma.eventType.findMany({
    where: { userId, isDeleted: false },
    select: EVENT_TYPE_SELECT,
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

export async function createEventType(
  userId: string,
  data: CreateEventTypeInput,
) {
  try {
    const eventType = await prisma.eventType.create({
      data: {
        userId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        duration: data.duration,
        locationType: data.locationType,
        meetingLink: data.meetingLink,
        bufferBefore: data.bufferBefore,
        bufferAfter: data.bufferAfter,
        minNoticeHours: data.minNoticeHours,
        maxPerDay: data.maxPerDay,
        isActive: data.isActive,
        availabilityScheduleId: data.availabilityScheduleId ?? null,
      },
      select: EVENT_TYPE_SELECT,
    });

    logger.info("Event type created", { eventTypeId: eventType.id, userId });
    return eventType;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("An event type with this slug already exists", 409);
    }
    throw err;
  }
}

export async function updateEventType(
  userId: string,
  id: string,
  data: UpdateEventTypeInput,
) {
  const existing = await verifyOwnership(id, userId);

  // Service-level guard: partial updates can leave ONLINE type without a link.
  // Determine the resulting locationType and meetingLink after the patch.
  const resultingLocationType = data.locationType ?? existing.locationType;
  const resultingMeetingLink =
    data.meetingLink !== undefined ? data.meetingLink : existing.meetingLink;

  if (
    resultingLocationType === LocationType.ONLINE &&
    !resultingMeetingLink
  ) {
    throw new AppError(
      "meetingLink is required when locationType is ONLINE",
      400,
    );
  }

  try {
    const eventType = await prisma.eventType.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.duration !== undefined && { duration: data.duration }),
        ...(data.locationType !== undefined && { locationType: data.locationType }),
        ...(data.meetingLink !== undefined && { meetingLink: data.meetingLink }),
        ...(data.bufferBefore !== undefined && { bufferBefore: data.bufferBefore }),
        ...(data.bufferAfter !== undefined && { bufferAfter: data.bufferAfter }),
        ...(data.minNoticeHours !== undefined && { minNoticeHours: data.minNoticeHours }),
        ...(data.maxPerDay !== undefined && { maxPerDay: data.maxPerDay }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.availabilityScheduleId !== undefined && {
          availabilityScheduleId: data.availabilityScheduleId,
        }),
      },
      select: EVENT_TYPE_SELECT,
    });

    logger.info("Event type updated", { eventTypeId: id, userId });
    return eventType;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("An event type with this slug already exists", 409);
    }
    throw err;
  }
}

export async function deleteEventType(userId: string, id: string) {
  await verifyOwnership(id, userId);

  // Block deletion if there are upcoming confirmed bookings
  const futureBookings = await prisma.booking.count({
    where: {
      eventTypeId: id,
      isDeleted: false,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { gt: new Date() },
    },
  });

  if (futureBookings > 0) {
    throw new AppError(
      "Cannot delete an event type with upcoming confirmed bookings",
      409,
    );
  }

  await prisma.eventType.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Event type deleted", { eventTypeId: id, userId });
}
