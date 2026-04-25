import { MeetingStatus } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { ListBookingsFilters } from "../../validators/bookingManagementSchema";
import {
  insertCalendarEvent,
  deleteCalendarEvent,
} from "../googleCalendarService";
import { getRecallBotQueue, getEmailQueue, JobNames } from "../../config/queue";
import { sendEmail } from "../email/emailService";
import {
  bookingReceivedEmail,
  bookingReceivedSubject,
} from "../email/templates/bookingReceived";
import {
  bookingConfirmationEmail,
  bookingConfirmationSubject,
} from "../email/templates/bookingConfirmation";
import {
  bookingCancelledEmail,
  bookingCancelledSubject,
} from "../email/templates/bookingCancelled";

/** Base URL for the dashboard app — used in email CTAs */
const APP_BASE_URL = process.env.FRONTEND_URL ?? "https://app.crelyzor.com";
/** Base URL for public-facing links (cancel, reschedule) */
const PUBLIC_BASE_URL = process.env.PUBLIC_URL ?? "https://crelyzor.com";

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
          slug: true,
          duration: true,
          locationType: true,
          meetingLink: true,
        },
      },
    },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.status !== "PENDING") {
    throw new AppError(
      `Cannot confirm a booking with status ${booking.status}`,
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" },
    });

    if (booking.meetingId) {
      await tx.meetingParticipant.createMany({
        data: [
          {
            meetingId: booking.meetingId,
            userId,
            participantType: "ORGANIZER",
          },
          {
            meetingId: booking.meetingId,
            guestEmail: booking.guestEmail,
            participantType: "ATTENDEE",
          },
        ],
        skipDuplicates: true,
      });
    }
  }, { timeout: 15000 });

  logger.info("Booking confirmed", { bookingId, userId });

  // Auto-create "Prepare for [meeting]" task — fail-open (task failure must not affect booking)
  try {
    await prisma.task.create({
      data: {
        userId,
        meetingId: booking.meetingId ?? null,
        title: `Prepare for ${booking.eventType.title} with ${booking.guestName}`,
        source: "MANUAL",
        dueDate: new Date(booking.startTime.getTime() - 60 * 60 * 1000),
        isCompleted: false,
        isDeleted: false,
      },
    });
    logger.info("Prepare task created for confirmed booking", {
      bookingId,
      userId,
    });
  } catch (err) {
    logger.error("Failed to create prepare task for booking (non-critical)", {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fetch host details for GCal + email prefs
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      username: true,
      email: true,
      settings: {
        select: {
          recallEnabled: true,
          emailNotificationsEnabled: true,
          bookingEmailsEnabled: true,
        },
      },
    },
  });

  // GCal — fail-open
  const gcalResult = await insertCalendarEvent(userId, {
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
  if (gcalResult?.googleEventId) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { googleEventId: gcalResult.googleEventId },
    });

    if (booking.meetingId && gcalResult.meetLink) {
      await prisma.meeting.update({
        where: { id: booking.meetingId },
        data: {
          meetLink: gcalResult.meetLink,
          location: gcalResult.meetLink,
        },
      });
    }
  } else {
    // Fail-open: booking is already confirmed in DB regardless of GCal outcome
    logger.warn(
      "GCal event creation returned no event ID — booking confirmed without calendar event",
      {
        bookingId,
        userId,
      },
    );
  }

  // Recall bot — fail-open
  const recallEnabled = user?.settings?.recallEnabled ?? false;
  if (
    recallEnabled &&
    booking.meetingId &&
    booking.eventType.locationType === "ONLINE"
  ) {
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

  // Emails — fail-open
  const emailsEnabled =
    (user?.settings?.emailNotificationsEnabled ?? true) &&
    (user?.settings?.bookingEmailsEnabled ?? true);

  if (emailsEnabled && user?.email) {
    try {
      // 1. Host: "New booking from [guest]"
      await sendEmail({
        to: user.email,
        subject: bookingReceivedSubject({
          guestName: booking.guestName,
          eventTypeTitle: booking.eventType.title,
        }),
        html: bookingReceivedEmail({
          hostName: user.name ?? "there",
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          guestNote: booking.guestNote,
          eventTypeTitle: booking.eventType.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          timezone: booking.timezone,
          bookingId,
          appBaseUrl: APP_BASE_URL,
        }),
      });

      // 2. Guest: "Your [event] with [host] is confirmed"
      await sendEmail({
        to: booking.guestEmail,
        subject: bookingConfirmationSubject({
          eventTypeTitle: booking.eventType.title,
          hostName: user.name ?? "your host",
        }),
        html: bookingConfirmationEmail({
          guestName: booking.guestName,
          hostName: user.name ?? "your host",
          eventTypeTitle: booking.eventType.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          timezone: booking.timezone,
          bookingId,
          cancelUrl: `${PUBLIC_BASE_URL}/bookings/${bookingId}/cancel`,
          rescheduleUrl: `${PUBLIC_BASE_URL}/schedule/${user?.username}/${booking.eventType.slug}?reschedule=${bookingId}`,
        }),
      });
    } catch (err) {
      logger.error(
        "Failed to send booking confirmation emails (non-critical)",
        {
          bookingId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }

    // 3. Queue a 24h reminder for BOTH host and guest
    try {
      const reminderAt = booking.startTime.getTime() - 24 * 60 * 60 * 1000;
      const delay = reminderAt - Date.now();
      if (delay > 0) {
        await getEmailQueue().add(
          JobNames.BOOKING_REMINDER,
          { bookingId },
          { delay },
        );
        logger.info("Booking reminder email queued", { bookingId, delay });
      }
    } catch (err) {
      logger.error("Failed to queue booking reminder email (non-critical)", {
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      });
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
    select: {
      id: true,
      status: true,
      meetingId: true,
      guestName: true,
      guestEmail: true,
      startTime: true,
      timezone: true,
      cancelReason: true,
      eventType: { select: { title: true } },
    },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.status !== "PENDING") {
    throw new AppError(
      `Cannot decline a booking with status ${booking.status}`,
      409,
    );
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

  // Notify guest of decline — fail-open
  try {
    const host = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        settings: {
          select: {
            emailNotificationsEnabled: true,
            bookingEmailsEnabled: true,
          },
        },
      },
    });
    const emailsEnabled =
      (host?.settings?.emailNotificationsEnabled ?? true) &&
      (host?.settings?.bookingEmailsEnabled ?? true);

    if (emailsEnabled) {
      await sendEmail({
        to: booking.guestEmail,
        subject: bookingCancelledSubject({
          eventTypeTitle: booking.eventType.title,
        }),
        html: bookingCancelledEmail({
          recipientName: booking.guestName,
          cancelledByName: host?.name ?? "the host",
          eventTypeTitle: booking.eventType.title,
          startTime: booking.startTime,
          timezone: booking.timezone,
          cancelReason: booking.cancelReason,
        }),
      });
    }
  } catch (err) {
    logger.error(
      "Failed to send booking decline email to guest (non-critical)",
      {
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }

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
    select: {
      id: true,
      status: true,
      meetingId: true,
      googleEventId: true,
      guestName: true,
      guestEmail: true,
      startTime: true,
      timezone: true,
      cancelReason: true,
      eventType: { select: { title: true } },
    },
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

  // Email both parties — fail-open
  try {
    const host = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        settings: {
          select: {
            emailNotificationsEnabled: true,
            bookingEmailsEnabled: true,
          },
        },
      },
    });
    const emailsEnabled =
      (host?.settings?.emailNotificationsEnabled ?? true) &&
      (host?.settings?.bookingEmailsEnabled ?? true);

    if (emailsEnabled) {
      const cancelledSubject = bookingCancelledSubject({
        eventTypeTitle: booking.eventType.title,
      });
      const hostName = host?.name ?? "the host";
      const sharedParams = {
        cancelledByName: hostName,
        eventTypeTitle: booking.eventType.title,
        startTime: booking.startTime,
        timezone: booking.timezone,
        cancelReason: booking.cancelReason,
      };
      await Promise.all([
        host?.email
          ? sendEmail({
              to: host.email,
              subject: cancelledSubject,
              html: bookingCancelledEmail({
                recipientName: hostName,
                ...sharedParams,
              }),
            })
          : Promise.resolve(),
        sendEmail({
          to: booking.guestEmail,
          subject: cancelledSubject,
          html: bookingCancelledEmail({
            recipientName: booking.guestName,
            ...sharedParams,
          }),
        }),
      ]);
    }
  } catch (err) {
    logger.error("Failed to send booking cancelled emails (non-critical)", {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: BOOKING_ACTION_SELECT,
  });
}
