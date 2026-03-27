import { MeetingStatus } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { ListBookingsFilters } from "../../validators/bookingManagementSchema";
import {
  insertCalendarEvent,
  deleteCalendarEvent,
} from "../googleCalendarService";
import { getRecallBotQueue, JobNames } from "../../config/queue";

// Fields returned for each booking in the list
const BOOKING_LIST_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  status: true,
  timezone: true,
  guestName: true,
  guestEmail: true,
  guestNote: true,
  cancelReason: true,
  canceledAt: true,
  createdAt: true,
  eventType: {
    select: {
      id: true,
      title: true,
      slug: true,
      duration: true,
      locationType: true,
    },
  },
} as const;

const BOOKING_ACTION_SELECT = {
  id: true,
  status: true,
  cancelReason: true,
  canceledAt: true,
} as const;

/**
 * Returns a paginated list of the host's bookings, optionally filtered by
 * status and/or date range.
 */
export async function listBookings(
  userId: string,
  filters: ListBookingsFilters,
) {
  const { status, from, to, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    isDeleted: false,
    ...(status && { status }),
    ...((from || to) && {
      startTime: {
        ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
      },
    }),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      select: BOOKING_LIST_SELECT,
      orderBy: { startTime: "asc" },
      skip,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    bookings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Confirms a PENDING booking. Triggers GCal event creation and Recall bot
 * queueing (both fail-open — booking is confirmed in DB regardless).
 */
export async function confirmBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, isDeleted: false },
    select: {
      id: true,
      status: true,
      meetingId: true,
      startTime: true,
      endTime: true,
      guestName: true,
      guestEmail: true,
      guestNote: true,
      timezone: true,
      eventType: {
        select: {
          title: true,
          duration: true,
          locationType: true,
          meetingLink: true,
        },
      },
    },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.status !== "PENDING") {
    throw new AppError(`Cannot confirm a booking with status ${booking.status}`, 409);
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED" },
  });

  logger.info("Booking confirmed", { bookingId, userId });

  // Fetch host details for GCal
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      settings: { select: { recallEnabled: true } },
    },
  });

  // GCal — fail-open
  const gcalEventId = await insertCalendarEvent(userId, {
    bookingId,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestTimezone: booking.timezone,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestNote: booking.guestNote,
    eventTypeTitle: booking.eventType.title,
    locationType: booking.eventType.locationType,
    meetingLink: booking.eventType.meetingLink,
    hostName: user?.name ?? "",
  });
  if (gcalEventId) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { googleEventId: gcalEventId },
    });
  }

  // Recall bot — fail-open
  const recallEnabled = user?.settings?.recallEnabled ?? false;
  if (recallEnabled && booking.meetingId && booking.eventType.locationType === "ONLINE") {
    const deployAt = booking.startTime.getTime() - 5 * 60 * 1000;
    const delay = deployAt - Date.now();

    if (delay > 0) {
      try {
        await getRecallBotQueue().add(
          JobNames.DEPLOY_RECALL_BOT,
          { meetingId: booking.meetingId, hostUserId: userId },
          { delay },
        );
        logger.info("Recall bot deployment queued on confirm", {
          meetingId: booking.meetingId,
          deployInMs: delay,
        });
      } catch (err) {
        logger.error("Failed to queue Recall bot on confirm (non-critical)", {
          meetingId: booking.meetingId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: BOOKING_ACTION_SELECT,
  });
}

/**
 * Declines a PENDING booking. No GCal event, no Recall bot.
 */
export async function declineBooking(
  userId: string,
  bookingId: string,
  reason?: string,
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, isDeleted: false },
    select: { id: true, status: true, meetingId: true },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.status !== "PENDING") {
    throw new AppError(`Cannot decline a booking with status ${booking.status}`, 409);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "DECLINED",
          cancelReason: reason ?? null,
          canceledAt: new Date(),
        },
      });

      if (booking.meetingId) {
        await tx.meeting.update({
          where: { id: booking.meetingId },
          data: { status: MeetingStatus.CANCELLED },
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("Booking declined by host", { bookingId, userId });

  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: BOOKING_ACTION_SELECT,
  });
}

/**
 * Cancels a booking as the host.
 * PENDING, CONFIRMED, and RESCHEDULED bookings can be cancelled.
 */
export async function cancelBooking(
  userId: string,
  bookingId: string,
  reason?: string,
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, isDeleted: false },
    select: { id: true, status: true, meetingId: true, googleEventId: true },
  });

  if (!booking) throw new AppError("Booking not found", 404);

  if (booking.status === "CANCELLED") {
    throw new AppError("Booking is already cancelled", 409);
  }
  if (booking.status === "NO_SHOW") {
    throw new AppError("No-show bookings cannot be cancelled", 409);
  }
  if (booking.status === "DECLINED") {
    throw new AppError("Declined bookings cannot be cancelled", 409);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          cancelReason: reason ?? null,
          canceledAt: new Date(),
        },
      });

      if (booking.meetingId) {
        await tx.meeting.update({
          where: { id: booking.meetingId },
          data: { status: MeetingStatus.CANCELLED },
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("Booking cancelled by host", { bookingId, userId });

  // Only clean up GCal if the booking was CONFIRMED (had a GCal event)
  if (booking.status === "CONFIRMED") {
    await deleteCalendarEvent(userId, booking.googleEventId);
  }

  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: BOOKING_ACTION_SELECT,
  });
}
