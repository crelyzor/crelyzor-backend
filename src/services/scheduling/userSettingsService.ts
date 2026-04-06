import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { env } from "../../config/environment";
import type { PatchUserSettingsInput } from "../../validators/userSettingsSchema";

const SETTINGS_SELECT = {
  id: true,
  userId: true,
  schedulingEnabled: true,
  maxWindowDays: true,
  defaultBufferMins: true,
  googleCalendarSyncEnabled: true,
  googleCalendarEmail: true,
  recallEnabled: true,
  autoTranscribe: true,
  autoAIProcess: true,
  defaultLanguage: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Default Mon–Fri 09:00–17:00 slots seeded on first setup
const DEFAULT_SLOTS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
}));

/**
 * Appends `recallAvailable` to settings before returning to client.
 * Derived from whether RECALL_API_KEY is configured at the platform level.
 */
function toClientSettings<T>(row: T): T & { recallAvailable: boolean } {
  return { ...row, recallAvailable: !!env.RECALL_API_KEY };
}

/**
 * Returns the user's settings, creating them with defaults if they don't exist.
 * Safe to call on every request — uses upsert to avoid race conditions.
 */
export async function getOrCreateUserSettings(userId: string) {
  // Check if settings already exist (fast path — no transaction needed for read)
  const existing = await prisma.userSettings.findUnique({
    where: { userId },
    select: SETTINGS_SELECT,
  });

  if (existing) return toClientSettings(existing);

  // Lazy-create: first time this user hits the settings endpoint.
  // Wraps UserSettings + default AvailabilitySchedule + slots in a transaction.
  const settings = await prisma.$transaction(
    async (tx) => {
      const created = await tx.userSettings.upsert({
        where: { userId },
        update: {}, // already exists — no-op
        create: { userId },
        select: SETTINGS_SELECT,
      });

      // Read user timezone for the default schedule
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });

      // Seed a default "Working Hours" schedule if none exists yet
      const existingSchedule = await tx.availabilitySchedule.findFirst({
        where: { userId, isDeleted: false },
        select: { id: true },
      });

      if (!existingSchedule) {
        const schedule = await tx.availabilitySchedule.create({
          data: {
            userId,
            name: "Working Hours",
            timezone: user?.timezone ?? "UTC",
            isDefault: true,
          },
          select: { id: true },
        });

        await tx.availability.createMany({
          data: DEFAULT_SLOTS.map((s) => ({ ...s, scheduleId: schedule.id })),
          skipDuplicates: true,
        });
      }

      logger.info("UserSettings created with defaults", { userId });
      return created;
    },
    { timeout: 15000 },
  );

  return toClientSettings(settings);
}

/**
 * Updates the user's settings. Validates business rules before writing.
 */
export async function updateUserSettings(
  userId: string,
  data: PatchUserSettingsInput,
) {
  // Business rules that require reading current state first
  if (data.googleCalendarSyncEnabled === true) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarEmail: true },
    });

    if (!settings?.googleCalendarEmail) {
      throw new AppError(
        "Connect a Google Calendar account before enabling sync",
        400,
      );
    }
  }

  if (data.recallEnabled === true && !env.RECALL_API_KEY) {
    throw new AppError(
      "Recording bot is not available on this instance",
      400,
    );
  }

  const updated = await prisma.userSettings.update({
    where: { userId },
    data,
    select: SETTINGS_SELECT,
  });

  logger.info("UserSettings updated", { userId });
  return toClientSettings(updated);
}
