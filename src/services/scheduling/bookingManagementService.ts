import { MeetingStatus } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { TeamContext } from "../../middleware/authMiddleware";
import type { ListBookingsFilters } from "../../validators/bookingManagementSchema";
import { env } from "../../config/environment";
import { decrypt, blindIndex, prismaBytes } from "../../utils/security/crypto";
import {
  insertCalendarEvent,
  deleteCalendarEvent,
} from "../googleCalendarService";
import { getRecallBotQueue, getEmailQueue, JobNames } from "../../config/queue";
import { sendEmail } from "../email/emailService";
import { createNotification } from "../notificationService";
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
import {
  BOOKING_NOT_FOUND_MESSAGE,
  bookingScope,
  principalForBooking,
  verifyBookingAccess,
  type BookingForAccess,
} from "./bookingPrincipal";

// Re-export so callers (controllers, worker, public booking service) can
// pick up the helpers from a single import surface.
export {
  BOOKING_NOT_FOUND_MESSAGE,
  bookingScope,
  principalForBooking,
  verifyBookingAccess,
} from "./bookingPrincipal";

/** Base URL for the dashboard app — used in email CTAs */
const APP_BASE_URL = env.FRONTEND_URL;
/** Base URL for public-facing links (cancel, reschedule) */
const PUBLIC_BASE_URL = env.PUBLIC_URL;

// Fields returned for each booking in the list
const BOOKING_LIST_SELECT = {
  id: true,
  userId: true,
  teamId: true,
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
 * Phase 6 P5.4.b — Fetch the booking by id alone, then run `verifyBookingAccess`
 * against the actor + team context. Uniform 404 on any failure.
 *
 * Returns a slim row including `userId` (host) + `teamId` (team scope) so
 * callers can derive `principalForBooking()` and route host-side side
 * effects (GCal, Recall, emails, Prepare Task) to the host's identity even
 * when the actor is a team admin acting on a member's booking.
 */
async function assertBookingAccess(
  actorId: string,
  bookingId: string,
  teamContext: TeamContext | null,
  mode: "read" | "mutate",
): Promise<BookingForAccess> {
  const row = await prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
    select: { id: true, userId: true, teamId: true },
  });
  if (!row) throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  verifyBookingAccess(actorId, row, teamContext, mode);
  return row;
}

/**
 * Returns a paginated list of the host's bookings, optionally filtered by
 * status and/or date range.
 *
 * Phase 6 P5.4.b — Honours team context via `bookingScope`. Per-row decrypt
 * uses `principalForBooking(b)` so encrypted guest PII is read with the
 * correct DEK regardless of whether the row is personal or team-scoped.
 */
export async function listBookings(
  userId: string,
  filters: ListBookingsFilters,
  teamContext: TeamContext | null = null,
) {
  const { status, from, to, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where = {
    isDeleted: false,
    ...bookingScope(userId, teamContext),
    ...(status && { status }),
    ...((from || to) && {
      startTime: {
        ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
      },
    }),
  };

  const [rawBookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      select: BOOKING_LIST_SELECT,
      orderBy: { startTime: "asc" },
      skip,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  const bookings = await Promise.all(
    rawBookings.map(async (b) => {
      const principal = principalForBooking(b);
      const [guestName, guestEmail, guestNote] = await Promise.all([
        decrypt(b.guestName, principal).catch(() => ""),
        decrypt(b.guestEmail, principal).catch(() => ""),
        b.guestNote
          ? decrypt(b.guestNote, principal).catch(() => null)
          : Promise.resolve(null),
      ]);
      return { ...b, guestName, guestEmail, guestNote };
    }),
  );

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
 * Confirms a PENDING booking.
 *
 * Phase 6 P5.4.b — Under team context, ADMIN/OWNER can confirm a MEMBER's
 * booking. **The host (MEMBER) keeps ownership of every downstream side
 * effect**: their GCal hosts the event, their RECALL hours are debited,
 * their task list gets the Prepare task, their inbox gets the receipt
 * email. The actor is used only for the access gate + audit log.
 *
 * Order of checks (enumeration-oracle defence):
 *   1. assertBookingAccess — 404 if not visible (uniform across not-found / wrong-team / MEMBER-no-mutate)
 *   2. Full fetch (now safe to read state — caller has access)
 *   3. Status 409 if not PENDING
 */
export async function confirmBooking(
  actorId: string,
  bookingId: string,
  teamContext: TeamContext | null = null,
) {
  // 1. Access gate — uniform 404 for not-found / wrong-team / MEMBER-no-mutate
  const access = await assertBookingAccess(
    actorId,
    bookingId,
    teamContext,
    "mutate",
  );

  // 2. Full fetch — only reachable after the gate, no info leak through status
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
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
  if (!booking) throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);

  // 3. Status check post-gate
  if (booking.status !== "PENDING") {
    throw new AppError(
      `Cannot confirm a booking with status ${booking.status}`,
      409,
    );
  }

  const hostId = access.userId;
  const teamId = access.teamId;
  const bookingPrincipal = principalForBooking(access);

  // Decrypt guest PII under the booking's principal (not the actor's)
  const [guestName, guestEmail, guestNote] = await Promise.all([
    decrypt(booking.guestName, bookingPrincipal).catch(() => "Guest"),
    decrypt(booking.guestEmail, bookingPrincipal).catch(() => ""),
    booking.guestNote
      ? decrypt(booking.guestNote, bookingPrincipal).catch(() => null)
      : Promise.resolve(null),
  ]);

  await prisma.$transaction(
    async (tx) => {
      // DB-layer TOCTOU guard: include teamId so a concurrent reassignment
      // can't land a stale-context update.
      await tx.booking.updateMany({
        where: { id: bookingId, teamId, isDeleted: false },
        data: { status: "CONFIRMED" },
      });

      if (booking.meetingId) {
        await tx.meetingParticipant.createMany({
          data: [
            {
              meetingId: booking.meetingId,
              userId: hostId,
              participantType: "ORGANIZER",
            },
            {
              meetingId: booking.meetingId,
              // guestEmail is already encrypted in DB via bookingService; pass the raw Bytes column value.
              // Recompute the blind index from the just-decrypted plaintext so participant lookup-by-email works.
              guestEmail: booking.guestEmail,
              guestEmailBidx: guestEmail
                ? prismaBytes(blindIndex(guestEmail))
                : undefined,
              participantType: "ATTENDEE",
            },
          ],
          skipDuplicates: true,
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("booking.confirm", {
    actorId,
    targetUserId: hostId,
    teamId,
    bookingId,
    action: "confirm",
  });

  // Auto-create "Prepare for [meeting]" task — fail-open
  // Phase 6 P5.4.b: task belongs to the HOST (MEMBER under team ctx), not
  // the actor. Inherits Booking.teamId so it appears on the team's task
  // surface for the host.
  try {
    await prisma.task.create({
      data: {
        userId: hostId,
        teamId,
        meetingId: booking.meetingId ?? null,
        title: `Prepare for ${booking.eventType.title} with ${guestName}`,
        source: "MANUAL",
        dueDate: new Date(booking.startTime.getTime() - 60 * 60 * 1000),
        isCompleted: false,
        isDeleted: false,
      },
    });
    logger.info("Prepare task created for confirmed booking", {
      bookingId,
      actorId,
      targetUserId: hostId,
      teamId,
    });
  } catch (err) {
    logger.error("Failed to create prepare task for booking (non-critical)", {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fetch host details (for GCal + email prefs) — under team ctx this is
  // the MEMBER, not the ADMIN actor.
  const host = await prisma.user.findUnique({
    where: { id: hostId },
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

  // GCal — fail-open. Calendar event lives on the host's calendar; OAuth
  // tokens belong to the host. Actor identity is irrelevant here.
  const gcalResult = await insertCalendarEvent(hostId, {
    bookingId,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestTimezone: booking.timezone,
    guestName,
    guestEmail,
    guestNote,
    eventTypeTitle: booking.eventType.title,
    locationType: booking.eventType.locationType,
    meetingLink: booking.eventType.meetingLink,
    hostName: host?.name ?? "",
  });
  if (gcalResult?.googleEventId) {
    await prisma.booking.updateMany({
      where: { id: bookingId, teamId, isDeleted: false },
      data: { googleEventId: gcalResult.googleEventId },
    });

    if (booking.meetingId && gcalResult.meetLink) {
      await prisma.meeting.updateMany({
        where: {
          id: booking.meetingId,
          createdById: hostId,
          isDeleted: false,
        },
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
        actorId,
        targetUserId: hostId,
      },
    );
  }

  // Recall bot — fail-open. hostUserId is the booking host (MEMBER under
  // team ctx); the worker re-resolves quota owner via getQuotaOwner at job
  // start using the teamId payload field.
  const recallEnabled = host?.settings?.recallEnabled ?? false;
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
          {
            meetingId: booking.meetingId,
            hostUserId: hostId,
            teamId: teamId ?? undefined,
          },
          { delay },
        );
        logger.info("Recall bot deployment queued on confirm", {
          meetingId: booking.meetingId,
          targetUserId: hostId,
          teamId,
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

  // Emails — fail-open. Host email goes to the MEMBER (booking owner), not
  // the ADMIN actor.
  const emailsEnabled =
    (host?.settings?.emailNotificationsEnabled ?? true) &&
    (host?.settings?.bookingEmailsEnabled ?? true);

  if (emailsEnabled && host?.email) {
    // 1. Host: "New booking from [guest]" — fail-open
    try {
      await sendEmail({
        to: host.email,
        subject: bookingReceivedSubject({
          guestName,
          eventTypeTitle: booking.eventType.title,
        }),
        html: bookingReceivedEmail({
          hostName: host.name ?? "there",
          guestName,
          guestEmail,
          guestNote,
          eventTypeTitle: booking.eventType.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          timezone: booking.timezone,
          bookingId,
          appBaseUrl: APP_BASE_URL,
        }),
      });
    } catch (err) {
      logger.error(
        "Failed to send booking-received email to host (non-critical)",
        {
          bookingId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }

    // 2. Guest: "Your [event] with [host] is confirmed" — fail-open
    try {
      if (guestEmail) {
        await sendEmail({
          to: guestEmail,
          subject: bookingConfirmationSubject({
            eventTypeTitle: booking.eventType.title,
            hostName: host.name ?? "your host",
          }),
          html: bookingConfirmationEmail({
            guestName,
            hostName: host.name ?? "your host",
            eventTypeTitle: booking.eventType.title,
            startTime: booking.startTime,
            endTime: booking.endTime,
            timezone: booking.timezone,
            bookingId,
            cancelUrl: `${PUBLIC_BASE_URL}/bookings/${bookingId}/cancel`,
            rescheduleUrl: `${PUBLIC_BASE_URL}/schedule/${host?.username}/${booking.eventType.slug}?reschedule=${bookingId}`,
          }),
        });
      }
    } catch (err) {
      logger.error(
        "Failed to send booking-confirmation email to guest (non-critical)",
        {
          bookingId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }

    // 3. Queue a 24h reminder for BOTH host and guest. teamId carried in
    //    the job payload so the worker decrypts under the same principal.
    try {
      const reminderAt = booking.startTime.getTime() - 24 * 60 * 60 * 1000;
      const delay = reminderAt - Date.now();
      if (delay > 0) {
        await getEmailQueue().add(
          JobNames.BOOKING_REMINDER,
          { bookingId, teamId: teamId ?? undefined },
          { delay },
        );
        logger.info("Booking reminder email queued", {
          bookingId,
          teamId,
          delay,
        });
      }
    } catch (err) {
      logger.error("Failed to queue booking reminder email (non-critical)", {
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // In-app notification goes to the HOST (booking owner), not the actor.
  await createNotification(
    hostId,
    "BOOKING_CONFIRMED",
    `Booking confirmed: ${booking.eventType.title} with ${guestName}`,
    `Your session on ${booking.startTime.toLocaleDateString()} is confirmed.`,
    "booking",
    bookingId,
  );

  return prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
    select: BOOKING_ACTION_SELECT,
  });
}

/**
 * Declines a PENDING booking. No GCal event, no Recall bot.
 *
 * Phase 6 P5.4.b — Same actor/host split as confirmBooking. Decline email
 * to guest is sent on behalf of the host (MEMBER under team ctx).
 */
export async function declineBooking(
  actorId: string,
  bookingId: string,
  reason?: string,
  teamContext: TeamContext | null = null,
) {
  // 1. Access gate
  const access = await assertBookingAccess(
    actorId,
    bookingId,
    teamContext,
    "mutate",
  );

  // 2. Full fetch post-gate
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
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
  if (!booking) throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);

  // 3. Status check post-gate
  if (booking.status !== "PENDING") {
    throw new AppError(
      `Cannot decline a booking with status ${booking.status}`,
      409,
    );
  }

  const hostId = access.userId;
  const teamId = access.teamId;
  const bookingPrincipal = principalForBooking(access);

  await prisma.$transaction(
    async (tx) => {
      await tx.booking.updateMany({
        where: { id: bookingId, teamId, isDeleted: false },
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

  logger.info("booking.decline", {
    actorId,
    targetUserId: hostId,
    teamId,
    bookingId,
    action: "decline",
  });

  // Notify guest of decline — fail-open
  try {
    const host = await prisma.user.findUnique({
      where: { id: hostId },
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
      const [guestName, guestEmail] = await Promise.all([
        decrypt(booking.guestName, bookingPrincipal).catch(() => "Guest"),
        decrypt(booking.guestEmail, bookingPrincipal).catch(() => ""),
      ]);

      if (guestEmail) {
        await sendEmail({
          to: guestEmail,
          subject: bookingCancelledSubject({
            eventTypeTitle: booking.eventType.title,
          }),
          html: bookingCancelledEmail({
            recipientName: guestName,
            cancelledByName: host?.name ?? "the host",
            eventTypeTitle: booking.eventType.title,
            startTime: booking.startTime,
            timezone: booking.timezone,
            cancelReason: booking.cancelReason,
          }),
        });
      }
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

  return prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
    select: BOOKING_ACTION_SELECT,
  });
}

/**
 * Cancels a booking as the host (or as a team admin acting for the host
 * under team context).
 *
 * Phase 6 P5.4.b — Same actor/host split as confirm/decline. GCal cleanup
 * targets the host's calendar; cancelled emails go to host + guest with
 * the host's email prefs.
 */
export async function cancelBooking(
  actorId: string,
  bookingId: string,
  reason?: string,
  teamContext: TeamContext | null = null,
) {
  // 1. Access gate
  const access = await assertBookingAccess(
    actorId,
    bookingId,
    teamContext,
    "mutate",
  );

  // 2. Full fetch post-gate
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
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
  if (!booking) throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);

  // 3. Status checks post-gate
  if (booking.status === "CANCELLED") {
    throw new AppError("Booking is already cancelled", 409);
  }
  if (booking.status === "NO_SHOW") {
    throw new AppError("No-show bookings cannot be cancelled", 409);
  }
  if (booking.status === "DECLINED") {
    throw new AppError("Declined bookings cannot be cancelled", 409);
  }

  const hostId = access.userId;
  const teamId = access.teamId;
  const bookingPrincipal = principalForBooking(access);

  await prisma.$transaction(
    async (tx) => {
      await tx.booking.updateMany({
        where: { id: bookingId, teamId, isDeleted: false },
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

  logger.info("booking.cancel", {
    actorId,
    targetUserId: hostId,
    teamId,
    bookingId,
    action: "cancel",
  });

  // Only clean up GCal if the booking was CONFIRMED (had a GCal event).
  // GCal event lives on the host's calendar.
  if (booking.status === "CONFIRMED") {
    await deleteCalendarEvent(hostId, booking.googleEventId);
  }

  // Email both parties — fail-open. Host email prefs apply (the MEMBER's
  // settings under team ctx, not the actor's).
  try {
    const host = await prisma.user.findUnique({
      where: { id: hostId },
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
      const [guestName, guestEmail] = await Promise.all([
        decrypt(booking.guestName, bookingPrincipal).catch(() => "Guest"),
        decrypt(booking.guestEmail, bookingPrincipal).catch(() => ""),
      ]);

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
        guestEmail
          ? sendEmail({
              to: guestEmail,
              subject: cancelledSubject,
              html: bookingCancelledEmail({
                recipientName: guestName,
                ...sharedParams,
              }),
            })
          : Promise.resolve(),
      ]);
    }
  } catch (err) {
    logger.error("Failed to send booking cancelled emails (non-critical)", {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
    select: BOOKING_ACTION_SELECT,
  });
}
