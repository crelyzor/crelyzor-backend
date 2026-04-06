import { MeetingStatus, MeetingType, Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { CreateBookingInput } from "../../validators/bookingSchema";
import { deleteCalendarEvent } from "../googleCalendarService";

// ── Timezone helpers ───────────────────────────────────────────────────────────

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
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);
  return idx === -1 ? 0 : idx;
}

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
 * Creates a PENDING booking for a guest.
 *
 * GCal event and Recall bot are NOT triggered here — they fire in confirmBooking
 * once the host approves. PENDING bookings block the slot (treated as busy) to
 * prevent double-booking before the host approves or declines.
 */
export async function createBooking(data: CreateBookingInput) {
  // 1. Resolve host by username (early 404 before entering the transaction)
  const user = await prisma.user.findFirst({
    where: { username: data.username, isDeleted: false },
    select: { id: true, name: true, username: true, timezone: true },
  });
  if (!user) throw new AppError("User not found", 404);
  if (!user.username) throw new AppError("User not found", 404);

  const startTime = new Date(data.startTime);

  const result = await prisma
    .$transaction(
      async (tx) => {
        // a. Re-read settings inside tx
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

        // b. Re-read event type inside tx
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
            meetingLink: true,
            availabilityScheduleId: true,
          },
        });
        if (!eventType) throw new AppError("Event type not found", 404);

        // c. Resolve effective schedule (event type's linked or user's default)
        const schedule = eventType.availabilityScheduleId
          ? await tx.availabilitySchedule.findFirst({
              where: { id: eventType.availabilityScheduleId, isDeleted: false },
              select: { id: true, timezone: true },
            })
          : await tx.availabilitySchedule.findFirst({
              where: { userId: user.id, isDefault: true, isDeleted: false },
              select: { id: true, timezone: true },
            });

        if (!schedule) {
          throw new AppError("No availability schedule configured", 400);
        }

        const tz = schedule.timezone || "UTC";

        // d. Compute endTime
        const endTime = new Date(
          startTime.getTime() + eventType.duration * 60 * 1000,
        );

        // e. minNoticeHours guard
        const minEarliestStart = new Date(
          Date.now() + settings.minNoticeHours * 60 * 60 * 1000,
        );
        if (startTime < minEarliestStart) {
          throw new AppError(
            `Booking requires at least ${settings.minNoticeHours} hours notice`,
            409,
          );
        }

        // f. maxWindowDays guard
        const maxBookingDate = new Date(
          Date.now() + settings.maxWindowDays * 24 * 60 * 60 * 1000,
        );
        if (startTime > maxBookingDate) {
          throw new AppError("Selected time is outside the booking window", 409);
        }

        // g. Check date override for this schedule
        const dateStr = getDateInTz(startTime, tz);
        const [oYr, oMo, oDa] = dateStr.split("-").map(Number);
        const overrideDate = new Date(Date.UTC(oYr, oMo - 1, oDa, 12, 0, 0));

        const override = await tx.availabilityOverride.findUnique({
          where: { scheduleId_date: { scheduleId: schedule.id, date: overrideDate } },
          select: { isBlocked: true, isDeleted: true },
        });
        if (override && !override.isDeleted && override.isBlocked) {
          throw new AppError("Selected date is unavailable", 409);
        }

        // h. Check weekly availability slots for this day
        const dayOfWeek = getDayOfWeekInTz(dateStr, tz);
        const availabilitySlots = await tx.availability.findMany({
          where: { scheduleId: schedule.id, dayOfWeek, isDeleted: false },
          select: { startTime: true, endTime: true },
        });
        if (availabilitySlots.length === 0) {
          throw new AppError("No availability for selected day", 409);
        }

        // i. Validate slot is within one of the availability windows
        const fitsInWindow = availabilitySlots.some((avail) => {
          const windowStart = zonedToUTC(dateStr, avail.startTime, tz);
          const windowEnd = zonedToUTC(dateStr, avail.endTime, tz);
          return startTime >= windowStart && endTime <= windowEnd;
        });
        if (!fitsInWindow) {
          throw new AppError("Selected time is outside availability window", 409);
        }

        // j. Conflict check with buffer padding
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
              status: { notIn: ["CANCELLED", "DECLINED"] },
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

        // k. maxPerDay guard
        if (eventType.maxPerDay !== null) {
          const firstSlot = availabilitySlots[0];
          const lastSlot = availabilitySlots[availabilitySlots.length - 1];
          const windowStart = zonedToUTC(dateStr, firstSlot.startTime, tz);
          const windowEnd = zonedToUTC(dateStr, lastSlot.endTime, tz);

          const dayBookingCount = await tx.booking.count({
            where: {
              userId: user.id,
              eventTypeId: eventType.id,
              isDeleted: false,
              status: { notIn: ["CANCELLED", "DECLINED"] },
              startTime: { gte: windowStart, lt: windowEnd },
            },
          });
          if (dayBookingCount >= eventType.maxPerDay) {
            throw new AppError("This day is fully booked", 409);
          }
        }

        // l. Duplicate guard
        const duplicateBooking = await tx.booking.findFirst({
          where: {
            userId: user.id,
            guestEmail: data.guestEmail,
            startTime,
            isDeleted: false,
            status: { notIn: ["CANCELLED", "DECLINED"] },
          },
          select: { id: true },
        });
        if (duplicateBooking) {
          throw new AppError(
            "A booking for this slot already exists for your email",
            409,
          );
        }

        // m. Per-guest-email frequency cap
        const recentGuestBookings = await tx.booking.count({
          where: {
            userId: user.id,
            guestEmail: data.guestEmail,
            isDeleted: false,
            status: { notIn: ["CANCELLED", "DECLINED"] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (recentGuestBookings >= 3) {
          throw new AppError(
            "You have reached the booking limit for this host",
            429,
          );
        }

        // n. Create Meeting first
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

        // o. Create Booking with PENDING status
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
            status: "PENDING",
          },
          select: BOOKING_SELECT,
        });

        return {
          booking,
          meetingId: meeting.id,
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
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034"
      ) {
        throw new AppError("Slot is no longer available", 409);
      }
      throw err;
    });

  logger.info("Booking created (PENDING — awaiting host approval)", {
    bookingId: result.booking.id,
    hostUsername: data.username,
    eventTypeSlug: data.eventTypeSlug,
    startTime: startTime.toISOString(),
  });

  return {
    booking: {
      ...result.booking,
      host: {
        name: user.name,
        username: user.username,
      },
      eventType: result.eventTypeSummary,
    },
  };
}

// ── Guest cancellation ────────────────────────────────────────────────────────

const GUEST_CANCEL_SELECT = {
  id: true,
  status: true,
  cancelReason: true,
  canceledAt: true,
} as const;

export async function cancelBookingAsGuest(bookingId: string, reason?: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, isDeleted: false },
    select: {
      id: true,
      status: true,
      meetingId: true,
      userId: true,
      googleEventId: true,
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

  // Only clean up GCal if the booking was CONFIRMED (had a GCal event)
  if (booking.status === "CONFIRMED") {
    await deleteCalendarEvent(booking.userId, booking.googleEventId);
  }

  return cancelled;
}

/**
 * Returns limited public details of a booking, used for the public cancellation/reschedule pages.
 */
export async function getPublicBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, isDeleted: false },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      timezone: true,
      guestName: true,
      guestEmail: true,
      eventType: {
        select: {
          title: true,
          duration: true,
          locationType: true,
        },
      },
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  return booking;
}
