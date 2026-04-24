import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { getCalendarBusyIntervals } from "../googleCalendarService";

// ── Timezone utilities ────────────────────────────────────────────────────────

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

// ── Resolve the effective schedule for a user + event type ────────────────────

async function resolveSchedule(
  userId: string,
  availabilityScheduleId: string | null,
) {
  if (availabilityScheduleId) {
    return prisma.availabilitySchedule.findFirst({
      where: { id: availabilityScheduleId, isDeleted: false },
      select: { id: true, timezone: true },
    });
  }
  return prisma.availabilitySchedule.findFirst({
    where: { userId, isDefault: true, isDeleted: false },
    select: { id: true, timezone: true },
  });
}

// ── Slot engine ───────────────────────────────────────────────────────────────

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

  // 2. Load settings
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: {
      schedulingEnabled: true,
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
    return { slots: [] };
  }

  // 4. Resolve event type — includes the linked schedule ID
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
      minNoticeHours: true,
      maxPerDay: true,
      availabilityScheduleId: true,
    },
  });
  if (!eventType) throw new AppError("Event type not found", 404);

  // 5. Resolve the effective schedule (event type's linked schedule or default)
  const schedule = await resolveSchedule(
    user.id,
    eventType.availabilityScheduleId,
  );
  if (!schedule) {
    logger.info("No availability schedule configured", { username });
    return { slots: [] };
  }

  const tz = schedule.timezone || "UTC";

  // 6. Get day of week in schedule's timezone
  const dayOfWeek = getDayOfWeekInTz(date, tz);

  // 7. Check availability override for this date
  const overrideDate = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0));
  const override = await prisma.availabilityOverride.findUnique({
    where: { scheduleId_date: { scheduleId: schedule.id, date: overrideDate } },
    select: { isBlocked: true, isDeleted: true },
  });
  if (override && !override.isDeleted && override.isBlocked) {
    return { slots: [] };
  }

  // 8. Get all availability slots for this day (multiple slots per day)
  const availabilitySlots = await prisma.availability.findMany({
    where: { scheduleId: schedule.id, dayOfWeek, isDeleted: false },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });
  if (availabilitySlots.length === 0) {
    logger.info("No availability slots for day", { username, date, dayOfWeek });
    return { slots: [] };
  }

  // 9. Apply minNoticeHours
  const minEarliestStart = new Date(
    Date.now() + eventType.minNoticeHours * 60 * 60 * 1000,
  );

  // 10. Fetch all busy intervals overlapping this day's full window
  const dayWindowStart = zonedToUTC(date, availabilitySlots[0].startTime, tz);
  const dayWindowEnd = zonedToUTC(
    date,
    availabilitySlots[availabilitySlots.length - 1].endTime,
    tz,
  );

  const [bookings, meetings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        userId: user.id,
        isDeleted: false,
        status: { notIn: ["CANCELLED", "DECLINED"] },
        startTime: { lt: dayWindowEnd },
        endTime: { gt: dayWindowStart },
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.meeting.findMany({
      where: {
        createdById: user.id,
        isDeleted: false,
        status: { not: "CANCELLED" },
        startTime: { lt: dayWindowEnd },
        endTime: { gt: dayWindowStart },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const busyIntervals = [...bookings, ...meetings];

  if (settings.googleCalendarSyncEnabled === true) {
    const gcalBusy = await getCalendarBusyIntervals(
      user.id,
      dayWindowStart,
      dayWindowEnd,
    );
    busyIntervals.push(...gcalBusy);
  }

  // 11. maxPerDay guard
  if (eventType.maxPerDay !== null) {
    const dayBookingCount = await prisma.booking.count({
      where: {
        userId: user.id,
        eventTypeId: eventType.id,
        isDeleted: false,
        status: { notIn: ["CANCELLED", "DECLINED"] },
        startTime: { gte: dayWindowStart, lt: dayWindowEnd },
      },
    });
    if (dayBookingCount >= eventType.maxPerDay) {
      return { slots: [] };
    }
  }

  // 12. Generate candidate slots across all availability windows for the day
  const durationMs = eventType.duration * 60 * 1000;
  const bufferBeforeMs = eventType.bufferBefore * 60 * 1000;
  const bufferAfterMs = eventType.bufferAfter * 60 * 1000;
  const slots: Array<{ startTime: string; endTime: string }> = [];

  for (const avail of availabilitySlots) {
    const windowStart = zonedToUTC(date, avail.startTime, tz);
    const windowEnd = zonedToUTC(date, avail.endTime, tz);
    const effectiveStart =
      windowStart > minEarliestStart ? windowStart : minEarliestStart;

    if (effectiveStart >= windowEnd) continue;

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
