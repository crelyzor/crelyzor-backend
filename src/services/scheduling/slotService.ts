import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { getCalendarBusyIntervals } from "../googleCalendarService";

// ── Timezone utilities ────────────────────────────────────────────────────────

/**
 * Convert a "YYYY-MM-DD HH:MM" local time in a named timezone to a UTC Date.
 *
 * Algorithm: treat the HH:MM as if it were UTC ("naive"), then ask Intl what
 * local time that UTC instant corresponds to in `tz`. The diff between naive
 * and the Intl reading gives the exact UTC offset at that wall-clock time —
 * which handles DST correctly (the offset is computed at the naive UTC instant,
 * which is close enough to the target local time for all business hours).
 *
 * Verified correct for: UTC±N, half-hour offsets (IST, NZST), DST transitions,
 * and far-east timezones (UTC+12/+13/+14).
 */
function zonedToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [yr, mo, da] = dateStr.split("-").map(Number);
  const [hr, mn] = timeStr.split(":").map(Number);

  // Treat the target local time as a UTC instant (purely for arithmetic)
  const naive = new Date(Date.UTC(yr, mo - 1, da, hr, mn, 0));

  // Ask Intl: "what local time does this UTC instant correspond to in tz?"
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
  // hour12: false can return "24" for midnight in some environments
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

  // offset = how many ms ahead UTC is vs localNaive (e.g. UTC+5.5 → offset = -5.5h)
  const offset = naive.getTime() - localNaive.getTime();
  return new Date(naive.getTime() + offset);
}

/**
 * Returns the day of week (0=Sun ... 6=Sat) for a YYYY-MM-DD date in the
 * given timezone.
 *
 * Uses noon UTC as the reference point to avoid off-by-one for timezones that
 * straddle the date boundary (e.g. UTC+13/+14 where noon UTC is already the
 * next calendar date locally). With explicit 'en-US' locale the weekday string
 * is always English regardless of server locale settings.
 */
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
  // If indexOf returns -1 (should never happen with en-US locale) default to 0
  return idx === -1 ? 0 : idx;
}

// ── Slot engine ───────────────────────────────────────────────────────────────

/**
 * Returns available booking slots for a given user + event type + date.
 *
 * All times in the returned slots array are UTC ISO strings.
 * Returns an empty slots array (not an error) when the day has no availability.
 *
 * @param username - The host's username (public identifier, not userId)
 * @param eventTypeSlug - The event type slug (public identifier, not eventTypeId)
 * @param date - YYYY-MM-DD date string (interpreted in the user's local timezone)
 */
export async function getSlots(
  username: string,
  eventTypeSlug: string,
  date: string,
) {
  // 1. Resolve user
  const user = await prisma.user.findFirst({
    where: { username, isDeleted: false },
    select: { id: true, timezone: true },
  });
  if (!user) throw new AppError("User not found", 404);

  const tz = user.timezone || "UTC";

  // 2. Load settings
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: {
      schedulingEnabled: true,
      minNoticeHours: true,
      maxWindowDays: true,
      googleCalendarSyncEnabled: true,
    },
  });
  if (!settings?.schedulingEnabled) {
    throw new AppError("Scheduling is not available for this user", 400);
  }

  // 3. Validate date is within the booking window
  const [yr, mo, da] = date.split("-").map(Number);
  const dayStartUTC = new Date(Date.UTC(yr, mo - 1, da, 0, 0, 0));
  const maxDateUTC = new Date(
    Date.now() + settings.maxWindowDays * 24 * 60 * 60 * 1000,
  );
  if (dayStartUTC > maxDateUTC) {
    logger.info("Slots requested beyond booking window", {
      username,
      date,
      maxWindowDays: settings.maxWindowDays,
    });
    return { slots: [] };
  }

  // 4. Resolve event type by slug (must belong to this user)
  const eventType = await prisma.eventType.findFirst({
    where: {
      userId: user.id,
      slug: eventTypeSlug,
      isActive: true,
      isDeleted: false,
    },
    select: {
      id: true,
      duration: true,
      bufferBefore: true,
      bufferAfter: true,
      maxPerDay: true,
    },
  });
  if (!eventType) throw new AppError("Event type not found", 404);

  // 5. Get day of week in user's timezone
  const dayOfWeek = getDayOfWeekInTz(date, tz);

  // 6. Check availability override for this date
  const overrideDate = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0));
  const override = await prisma.availabilityOverride.findUnique({
    where: { userId_date: { userId: user.id, date: overrideDate } },
    select: { isBlocked: true, isDeleted: true },
  });
  if (override && !override.isDeleted && override.isBlocked) {
    logger.info("Slots blocked by override", { username, date });
    return { slots: [] };
  }

  // 7. Get weekly availability row for this day
  const availability = await prisma.availability.findUnique({
    where: { userId_dayOfWeek: { userId: user.id, dayOfWeek } },
    select: { startTime: true, endTime: true, isDeleted: true },
  });
  if (!availability || availability.isDeleted) {
    logger.info("No availability for day", { username, date, dayOfWeek });
    return { slots: [] };
  }

  // 8. Build availability window in UTC
  const windowStart = zonedToUTC(date, availability.startTime, tz);
  const windowEnd = zonedToUTC(date, availability.endTime, tz);

  // 9. Apply minNoticeHours — earliest slot the user can accept
  const minEarliestStart = new Date(
    Date.now() + settings.minNoticeHours * 60 * 60 * 1000,
  );
  const effectiveStart =
    windowStart > minEarliestStart ? windowStart : minEarliestStart;

  if (effectiveStart >= windowEnd) {
    logger.info("No slots — window expired or all within notice period", {
      username,
      date,
    });
    return { slots: [] };
  }

  // 10. maxPerDay guard — if the day is already fully booked, skip slot generation
  if (eventType.maxPerDay !== null) {
    const dayBookingCount = await prisma.booking.count({
      where: {
        userId: user.id,
        eventTypeId: eventType.id,
        isDeleted: false,
        status: { not: "CANCELLED" },
        startTime: { gte: windowStart, lt: windowEnd },
      },
    });
    if (dayBookingCount >= eventType.maxPerDay) {
      logger.info("Slots exhausted — maxPerDay reached", {
        username,
        date,
        maxPerDay: eventType.maxPerDay,
      });
      return { slots: [] };
    }
  }

  // 11. Fetch all busy intervals overlapping this day's window
  const [bookings, meetings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        userId: user.id,
        isDeleted: false,
        status: { not: "CANCELLED" },
        startTime: { lt: windowEnd },
        endTime: { gt: windowStart },
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.meeting.findMany({
      where: {
        createdById: user.id,
        isDeleted: false,
        status: { not: "CANCELLED" },
        startTime: { lt: windowEnd },
        endTime: { gt: windowStart },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const busyIntervals = [...bookings, ...meetings];

  // 11b. Merge Google Calendar busy intervals when sync is enabled (fail-open)
  if (settings.googleCalendarSyncEnabled === true) {
    const gcalBusy = await getCalendarBusyIntervals(user.id, windowStart, windowEnd);
    busyIntervals.push(...gcalBusy);
  }

  // 12. Generate candidate slots, advancing by `duration` each step.
  //
  //  Each slot [s, s+duration] is valid if:
  //   - s + duration <= windowEnd (fits in the availability window)
  //   - No busy interval [b_start, b_end] overlaps [s - bufferBefore, s + duration + bufferAfter]
  //
  //  Buffers are applied to conflict detection only — they do not shift the
  //  slot start visible to the guest. This is the cal.com convention.
  const durationMs = eventType.duration * 60 * 1000;
  const bufferBeforeMs = eventType.bufferBefore * 60 * 1000;
  const bufferAfterMs = eventType.bufferAfter * 60 * 1000;

  const slots: Array<{ startTime: string; endTime: string }> = [];
  let slotStart = new Date(effectiveStart.getTime());

  while (slotStart.getTime() + durationMs <= windowEnd.getTime()) {
    const slotEnd = new Date(slotStart.getTime() + durationMs);
    const blockStart = new Date(slotStart.getTime() - bufferBeforeMs);
    const blockEnd = new Date(slotEnd.getTime() + bufferAfterMs);

    const hasConflict = busyIntervals.some(
      (b) => blockStart < b.endTime && blockEnd > b.startTime,
    );

    if (!hasConflict) {
      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
      });
    }

    slotStart = new Date(slotStart.getTime() + durationMs);
  }

  logger.info("Slots computed", {
    username,
    eventTypeSlug,
    date,
    count: slots.length,
  });

  return { slots };
}

// ── Public scheduling profile ─────────────────────────────────────────────────

/**
 * Returns a user's public scheduling profile — display info + active event types.
 * Internal user.id is never returned (only public-facing identifiers).
 *
 * @throws AppError 404 when user not found or scheduling disabled
 */
export async function getSchedulingProfile(username: string) {
  const user = await prisma.user.findFirst({
    where: { username, isDeleted: false },
    select: { id: true, name: true, avatarUrl: true, timezone: true },
  });
  if (!user) throw new AppError("Profile not found", 404);

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { schedulingEnabled: true },
  });
  if (!settings?.schedulingEnabled) {
    throw new AppError("Scheduling not available", 404);
  }

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: user.id, isActive: true, isDeleted: false },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      duration: true,
      locationType: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Deliberately omit user.id — internal UUIDs must not be exposed on public endpoints
  return {
    user: {
      username,
      name: user.name,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
    },
    eventTypes,
  };
}
