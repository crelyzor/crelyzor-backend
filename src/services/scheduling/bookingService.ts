import { MeetingStatus, MeetingType, Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { CreateBookingInput } from "../../validators/bookingSchema";
import {
  insertCalendarEvent,
  deleteCalendarEvent,
} from "../googleCalendarService";

// ── Timezone helpers (duplicated from slotService — small enough to avoid premature abstraction) ──

function zonedToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [yr, mo, da] = dateStr.split("-").map(Number);
  const [hr, mn] = timeStr.split(":").map(Number);
  const naive = new Date(Date.UTC(yr, mo - 1, da, hr, mn, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(naive);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const localH = p.hour === "24" ? 0 : parseInt(p.hour);
  const localNaive = new Date(
    Date.UTC(
      parseInt(p.year),
      parseInt(p.month) - 1,
      parseInt(p.day),
      localH,
      parseInt(p.minute),
      parseInt(p.second),
    ),
  );
  const offset = naive.getTime() - localNaive.getTime();
  return new Date(naive.getTime() + offset);
}

function getDayOfWeekInTz(dateStr: string, tz: string): number {
  const [yr, mo, da] = dateStr.split("-").map(Number);
  const noonUTC = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0));
  const weekdayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(noonUTC);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekdayStr,
  );
  return idx === -1 ? 0 : idx;
}

/** Converts a UTC Date to "YYYY-MM-DD" in the given IANA timezone. */
function getDateInTz(utcDate: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcDate);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ── Booking creation ──────────────────────────────────────────────────────────

const BOOKING_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  timezone: true,
  status: true,
  guestName: true,
  guestEmail: true,
  guestNote: true,
} as const;

/**
 * Creates a confirmed booking for a guest.
 *
 * All mutable state (schedulingEnabled, eventType.isActive, conflicts) is
 * re-read inside a Serializable transaction to prevent races. A P2034
 * (serialization failure) means a concurrent request took the slot → 409.
 *
 * NOTE: user.id is used internally only and must never appear in the response.
 *       meetingLink is intentionally omitted from the response — it travels
 *       to the guest via confirmation email only, preventing link scraping.
 */
export async function createBooking(data: CreateBookingInput) {
  // 1. Resolve host by username (early 404 before entering the transaction)
  const user = await prisma.user.findFirst({
    where: { username: data.username, isDeleted: false },
    // user.id is used internally only — never returned to caller
    select: { id: true, name: true, username: true, timezone: true },
  });
  if (!user) throw new AppError("User not found", 404);

  // username is String? in the schema — any scheduling-enabled user must have one,
  // but guard defensively so the response never contains a null username.
  if (!user.username) throw new AppError("User not found", 404);

  const tz = user.timezone || "UTC";

  // 2. Parse startTime (Zod already validated it is future + valid ISO UTC)
  const startTime = new Date(data.startTime);

  // 3. All validation + creation inside a Serializable transaction.
  //    Every mutable state check (schedulingEnabled, isActive, conflicts)
  //    is re-read via tx.* inside the lambda so changes between the outer
  //    check and the transaction are caught correctly.
  //
  //    The transaction returns the full confirmation payload so all values
  //    (eventType details, booking row) are available in the outer scope.
  const result = await prisma
    .$transaction(
      async (tx) => {
        // a. Re-read settings inside tx — host may have toggled schedulingEnabled
        const settings = await tx.userSettings.findUnique({
          where: { userId: user.id },
          select: {
            schedulingEnabled: true,
            minNoticeHours: true,
            maxWindowDays: true,
          },
        });
        if (!settings?.schedulingEnabled) {
          throw new AppError("Scheduling is not available for this user", 400);
        }

        // b. Re-read event type inside tx — host may have deactivated it
        const eventType = await tx.eventType.findFirst({
          where: {
            userId: user.id,
            slug: data.eventTypeSlug,
            isActive: true,
            isDeleted: false,
          },
          select: {
            id: true,
            title: true,
            duration: true,
            locationType: true,
            bufferBefore: true,
            bufferAfter: true,
            maxPerDay: true,
            meetingLink: true, // needed for Google Calendar event location field
          },
        });
        if (!eventType) throw new AppError("Event type not found", 404);

        // c. Compute endTime from the tx-fresh duration (safe against race on duration change)
        const endTime = new Date(
          startTime.getTime() + eventType.duration * 60 * 1000,
        );

        // d. minNoticeHours guard — Date.now() is evaluated inside the tx for freshness
        const minEarliestStart = new Date(
          Date.now() + settings.minNoticeHours * 60 * 60 * 1000,
        );
        if (startTime < minEarliestStart) {
          throw new AppError(
            `Booking requires at least ${settings.minNoticeHours} hours notice`,
            409,
          );
        }

        // e. maxWindowDays guard — prevents bookings arbitrarily far in the future
        const maxBookingDate = new Date(
          Date.now() + settings.maxWindowDays * 24 * 60 * 60 * 1000,
        );
        if (startTime > maxBookingDate) {
          throw new AppError(
            "Selected time is outside the booking window",
            409,
          );
        }

        // f. Derive calendar date in host's timezone and check override
        const dateStr = getDateInTz(startTime, tz);
        const [yr, mo, da] = dateStr.split("-").map(Number);
        const overrideDate = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0));

        const override = await tx.availabilityOverride.findUnique({
          where: { userId_date: { userId: user.id, date: overrideDate } },
          select: { isBlocked: true, isDeleted: true },
        });
        if (override && !override.isDeleted && override.isBlocked) {
          throw new AppError("Selected date is unavailable", 409);
        }

        // g. Check weekly availability for this day
        const dayOfWeek = getDayOfWeekInTz(dateStr, tz);
        const availability = await tx.availability.findUnique({
          where: { userId_dayOfWeek: { userId: user.id, dayOfWeek } },
          select: { startTime: true, endTime: true, isDeleted: true },
        });
        if (!availability || availability.isDeleted) {
          throw new AppError("No availability for selected day", 409);
        }

        // h. Validate slot is within the availability window
        const windowStart = zonedToUTC(dateStr, availability.startTime, tz);
        const windowEnd = zonedToUTC(dateStr, availability.endTime, tz);
        if (startTime < windowStart || endTime > windowEnd) {
          throw new AppError(
            "Selected time is outside availability window",
            409,
          );
        }

        // i. Conflict check with buffer padding — covers both bookings and meetings
        const blockStart = new Date(
          startTime.getTime() - eventType.bufferBefore * 60 * 1000,
        );
        const blockEnd = new Date(
          endTime.getTime() + eventType.bufferAfter * 60 * 1000,
        );

        const [conflictBooking, conflictMeeting] = await Promise.all([
          tx.booking.findFirst({
            where: {
              userId: user.id,
              isDeleted: false,
              status: { not: "CANCELLED" },
              startTime: { lt: blockEnd },
              endTime: { gt: blockStart },
            },
            select: { id: true },
          }),
          tx.meeting.findFirst({
            where: {
              createdById: user.id,
              isDeleted: false,
              status: { not: "CANCELLED" },
              startTime: { lt: blockEnd },
              endTime: { gt: blockStart },
            },
            select: { id: true },
          }),
        ]);

        if (conflictBooking || conflictMeeting) {
          throw new AppError("Slot is no longer available", 409);
        }

        // j. maxPerDay guard
        if (eventType.maxPerDay !== null) {
          const dayBookingCount = await tx.booking.count({
            where: {
              userId: user.id,
              eventTypeId: eventType.id,
              isDeleted: false,
              status: { not: "CANCELLED" },
              startTime: { gte: windowStart, lt: windowEnd },
            },
          });
          if (dayBookingCount >= eventType.maxPerDay) {
            throw new AppError("This day is fully booked", 409);
          }
        }

        // k. Duplicate guard — same guest submitting the same slot twice (network retry)
        const duplicateBooking = await tx.booking.findFirst({
          where: {
            userId: user.id,
            guestEmail: data.guestEmail,
            startTime,
            isDeleted: false,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        if (duplicateBooking) {
          throw new AppError(
            "A booking for this slot already exists for your email",
            409,
          );
        }

        // l. Per-guest-email frequency cap — prevents calendar flooding
        //    (3 bookings per 24 hours per guest per host)
        const recentGuestBookings = await tx.booking.count({
          where: {
            userId: user.id,
            guestEmail: data.guestEmail,
            isDeleted: false,
            status: { not: "CANCELLED" },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (recentGuestBookings >= 3) {
          throw new AppError(
            "You have reached the booking limit for this host",
            429,
          );
        }

        // m. Create the Meeting first (Booking.meetingId links to Meeting, not the other way around)
        //    TODO: Queue confirmation email with meetingLink after this transaction completes
        const meeting = await tx.meeting.create({
          data: {
            title: `${eventType.title} with ${data.guestName}`,
            type: MeetingType.SCHEDULED,
            startTime,
            endTime,
            timezone: tz,
            createdById: user.id,
          },
          select: { id: true },
        });

        // n. Create the Booking linked to the new Meeting
        const booking = await tx.booking.create({
          data: {
            eventTypeId: eventType.id,
            userId: user.id,
            meetingId: meeting.id,
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            guestNote: data.guestNote,
            startTime,
            endTime,
            timezone: data.guestTimezone,
            status: "CONFIRMED",
          },
          select: BOOKING_SELECT,
        });

        // Return the booking + event type summary together so both are
        // available in the outer scope for the response shape
        return {
          booking,
          eventTypeSummary: {
            title: eventType.title,
            duration: eventType.duration,
            locationType: eventType.locationType,
            meetingLink: eventType.meetingLink,
          },
        };
      },
      {
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )
    .catch((err: unknown) => {
      // Serialization failure: two concurrent requests raced for the same slot.
      // Surface as 409 (slot taken) — the client should re-fetch available slots.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034"
      ) {
        throw new AppError("Slot is no longer available", 409);
      }
      throw err;
    });

  logger.info("Booking created", {
    bookingId: result.booking.id,
    hostUsername: data.username,
    eventTypeSlug: data.eventTypeSlug,
    startTime: startTime.toISOString(),
  });

  // Google Calendar write sync — fail-open: booking is already confirmed.
  // GCal call is intentionally outside the transaction to avoid holding DB locks
  // during external API round-trips and to prevent GCal failures from rolling
  // back a successfully created booking.
  const gcalEventId = await insertCalendarEvent(user.id, {
    bookingId: result.booking.id,
    startTime,
    endTime: new Date(startTime.getTime() + result.eventTypeSummary.duration * 60 * 1000),
    guestTimezone: data.guestTimezone,
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    guestNote: data.guestNote,
    eventTypeTitle: result.eventTypeSummary.title,
    locationType: result.eventTypeSummary.locationType,
    meetingLink: result.eventTypeSummary.meetingLink,
    hostName: user.name,
  });
  if (gcalEventId) {
    await prisma.booking.update({
      where: { id: result.booking.id },
      data: { googleEventId: gcalEventId },
    });
  }

  // meetingLink intentionally omitted from response — sent to guest via confirmation email only.
  // This prevents unauthenticated callers from scraping private video conference links.
  return {
    booking: {
      ...result.booking,
      host: {
        name: user.name,
        username: user.username, // asserted non-null above
      },
      eventType: result.eventTypeSummary,
    },
  };
}

// Fields returned after guest cancellation
const GUEST_CANCEL_SELECT = {
  id: true,
  status: true,
  cancelReason: true,
  canceledAt: true,
} as const;

/**
 * Cancels a booking as the guest. The booking UUID is the guest's only
 * authorization token — this is the standard Cal.com/Calendly pattern.
 * UUID entropy (128-bit) makes enumeration infeasible.
 *
 * Only CONFIRMED and RESCHEDULED bookings can be cancelled.
 * CANCELLED and NO_SHOW are terminal states.
 */
export async function cancelBookingAsGuest(
  bookingId: string,
  reason?: string,
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
    // userId and googleEventId are used internally for GCal cleanup only —
    // neither field appears in the response shape (GUEST_CANCEL_SELECT)
    select: { id: true, status: true, meetingId: true, userId: true, googleEventId: true },
  });

  if (!booking) throw new AppError("Booking not found", 404);

  if (booking.status === "CANCELLED") {
    throw new AppError("Booking is already cancelled", 409);
  }
  if (booking.status === "NO_SHOW") {
    throw new AppError("No-show bookings cannot be cancelled", 409);
  }
  // Covers CONFIRMED and RESCHEDULED — both are active states the guest can cancel

  const cancelled = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          cancelReason: reason ?? null,
          canceledAt: new Date(),
        },
        select: GUEST_CANCEL_SELECT,
      });

      if (booking.meetingId) {
        await tx.meeting.update({
          where: { id: booking.meetingId },
          data: { status: MeetingStatus.CANCELLED },
        });
      }

      return updated;
    },
    { timeout: 15000 },
  );

  logger.info("Booking cancelled by guest", { bookingId });

  // Google Calendar write sync — fail-open: booking is already cancelled in DB.
  // GCal call is outside the transaction to avoid DB lock inflation and to
  // ensure a GCal failure does not roll back the confirmed cancellation.
  await deleteCalendarEvent(booking.userId, booking.googleEventId);

  return cancelled;
}
