import { Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type {
  PatchAvailabilityDayInput,
  CreateOverrideInput,
} from "../../validators/availabilitySchema";

const AVAILABILITY_SELECT = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  updatedAt: true,
} as const;

const OVERRIDE_SELECT = {
  id: true,
  date: true,
  isBlocked: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Parse "YYYY-MM-DD" to a Date set to noon UTC to avoid timezone-induced off-by-one errors.
 * e.g. new Date("2025-06-15") in UTC-5 resolves to 2025-06-14 local — this avoids that.
 */
function parseDateSafe(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

// ── Weekly availability ────────────────────────────────────────────────────

/**
 * Returns a normalized 7-row array (Sun–Sat).
 * Days with no active availability row are returned with isOff: true.
 */
export async function getAvailability(userId: string) {
  const rows = await prisma.availability.findMany({
    where: { userId, isDeleted: false },
    select: AVAILABILITY_SELECT,
  });

  const rowsByDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = rowsByDay.get(dayOfWeek);
    if (row) {
      return {
        dayOfWeek,
        isOff: false as const,
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        updatedAt: row.updatedAt,
      };
    }
    return {
      dayOfWeek,
      isOff: true as const,
      id: null,
      startTime: null,
      endTime: null,
      updatedAt: null,
    };
  });
}

/**
 * Bulk upsert weekly availability. Each day is either set to a time range or marked off.
 * Wraps all writes in a single transaction.
 */
export async function patchAvailability(
  userId: string,
  days: PatchAvailabilityDayInput[],
) {
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const day of days) {
          if (day.isOff) {
            // Soft-delete any active row for this day
            await tx.availability.updateMany({
              where: { userId, dayOfWeek: day.dayOfWeek, isDeleted: false },
              data: { isDeleted: true, deletedAt: new Date() },
            });
          } else {
            // Upsert: the @@unique([userId, dayOfWeek]) constraint means upsert
            // will find the row (even if soft-deleted) and update it, or create new.
            await tx.availability.upsert({
              where: { userId_dayOfWeek: { userId, dayOfWeek: day.dayOfWeek } },
              create: {
                userId,
                dayOfWeek: day.dayOfWeek,
                startTime: day.startTime!,
                endTime: day.endTime!,
              },
              update: {
                startTime: day.startTime!,
                endTime: day.endTime!,
                isDeleted: false,
                deletedAt: null,
              },
            });
          }
        }
      },
      { timeout: 15000 },
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("Duplicate day in request", 409);
    }
    throw err;
  }

  logger.info("Availability updated", { userId, days: days.length });
}

// ── Availability overrides ─────────────────────────────────────────────────

/**
 * Returns all non-deleted overrides for the user, sorted by date ascending.
 */
export async function getOverrides(userId: string) {
  return prisma.availabilityOverride.findMany({
    where: { userId, isDeleted: false },
    select: OVERRIDE_SELECT,
    orderBy: { date: "asc" },
  });
}

/**
 * Creates or updates an override for a specific date (idempotent).
 */
export async function createOverride(
  userId: string,
  data: CreateOverrideInput,
) {
  const date = parseDateSafe(data.date);

  const override = await prisma.availabilityOverride.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, isBlocked: data.isBlocked },
    update: { isBlocked: data.isBlocked, isDeleted: false, deletedAt: null },
    select: OVERRIDE_SELECT,
  });

  logger.info("Availability override created/updated", {
    userId,
    date: data.date,
  });

  return override;
}

/**
 * Soft-deletes an override. Returns 404 for not-found or wrong-owner (no enumeration).
 */
export async function deleteOverride(userId: string, overrideId: string) {
  const existing = await prisma.availabilityOverride.findFirst({
    where: { id: overrideId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!existing) throw new AppError("Override not found", 404);

  await prisma.availabilityOverride.update({
    where: { id: overrideId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Availability override deleted", { userId, overrideId });
}
