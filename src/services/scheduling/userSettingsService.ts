import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { encrypt } from "../../utils/encryption";
import type { PatchUserSettingsInput } from "../../validators/userSettingsSchema";

// Internal select — includes recallApiKey only to compute hasRecallApiKey before stripping it
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
  recallApiKey: true, // fetched to compute hasRecallApiKey — stripped before returning to client
  autoTranscribe: true,
  autoAIProcess: true,
  defaultLanguage: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Strips recallApiKey from the raw DB row and replaces it with
 * a safe boolean `hasRecallApiKey`. Never sends the encrypted key to the client.
 */
function toClientSettings<T extends { recallApiKey: string | null }>(
  row: T,
): Omit<T, "recallApiKey"> & { hasRecallApiKey: boolean } {
  const { recallApiKey, ...rest } = row;
  return { ...rest, hasRecallApiKey: recallApiKey !== null };
}

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

  if (existing) return toClientSettings(existing);

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
  if (data.googleCalendarSyncEnabled === true || data.recallEnabled === true) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarEmail: true, recallApiKey: true },
    });

    if (data.googleCalendarSyncEnabled === true && !settings?.googleCalendarEmail) {
      throw new AppError(
        "Connect a Google Calendar account before enabling sync",
        400,
      );
    }

    if (data.recallEnabled === true && !settings?.recallApiKey) {
      throw new AppError(
        "Save a Recall.ai API key before enabling Recall",
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
  return toClientSettings(updated);
}

/**
 * Saves (or replaces) the user's Recall.ai API key, encrypted at rest.
 * The plaintext key is never stored or returned — only the encrypted form.
 */
export async function upsertRecallApiKey(
  userId: string,
  plaintextApiKey: string,
): Promise<void> {
  const encrypted = encrypt(plaintextApiKey);

  await prisma.userSettings.upsert({
    where: { userId },
    update: { recallApiKey: encrypted },
    create: { userId, recallApiKey: encrypted },
    select: { id: true }, // minimal select — we return nothing to caller
  });

  logger.info("Recall.ai API key saved", { userId });
}
