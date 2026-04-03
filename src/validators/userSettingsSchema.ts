import { z } from "zod";

// BCP-47 language tag: e.g. "en", "en-US", "fr", "zh-TW"
const languageRegex = /^[a-z]{2,3}(-[A-Z]{2,4})?$/;

export const patchUserSettingsSchema = z
  .object({
    schedulingEnabled: z.boolean().optional(),
    minNoticeHours: z.number().int().min(0).max(168).optional(),
    maxWindowDays: z.number().int().min(1).max(365).optional(),
    defaultBufferMins: z.number().int().min(0).max(120).optional(),
    googleCalendarSyncEnabled: z.boolean().optional(),
    recallEnabled: z.boolean().optional(),
    autoTranscribe: z.boolean().optional(),
    autoAIProcess: z.boolean().optional(),
    defaultLanguage: z
      .string()
      .regex(languageRegex, "Must be a valid BCP-47 language tag (e.g. en, en-US)")
      .optional(),
  })
  .strict(); // reject recallApiKey, googleCalendarEmail, userId, etc.

export type PatchUserSettingsInput = z.infer<typeof patchUserSettingsSchema>;
