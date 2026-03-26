import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { PatchUserSettingsInput } from "../../validators/userSettingsSchema";

// Fields returned to the client — recallApiKey is intentionally excluded
const SETTINGS_SELECT = {
  id: true,
  userId: true,
  schedulingEnabled: true,
  minNoticeHours: true,
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

// Default Mon–Fri 09:00–17:00 availability rows seeded on first setup
const DEFAULT_AVAILABILITY = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
}));

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

  if (existing) return existing;

  // Lazy-create: first time this user hits the settings endpoint.
  // Wraps UserSettings + Availability seeding in a transaction.
  const settings = await prisma.$transaction(
    async (tx) => {
      const created = await tx.userSettings.upsert({
        where: { userId },
        update: {}, // already exists — no-op
        create: { userId },
        select: SETTINGS_SELECT,
      });

      // Seed Mon–Fri availability if not already present
      await tx.availability.createMany({
        data: DEFAULT_AVAILABILITY.map((a) => ({ ...a, userId })),
        skipDuplicates: true,
      });

      logger.info("UserSettings created with defaults", { userId });
      return created;
    },
    { timeout: 15000 },
  );

  return settings;
}

/**
 * Updates the user's settings. Validates business rules before writing.
 */
export async function updateUserSettings(
  userId: string,
  data: PatchUserSettingsInput,
) {
  // Business rule: cannot enable Google Calendar sync without a connected account
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

  const updated = await prisma.userSettings.update({
    where: { userId },
    data,
    select: SETTINGS_SELECT,
  });

  logger.info("UserSettings updated", { userId });
  return updated;
}
