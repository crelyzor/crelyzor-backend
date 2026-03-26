import { z } from "zod";

export const createBookingSchema = z
  .object({
    username: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Must contain only letters, numbers, hyphens, or underscores",
      ),

    eventTypeSlug: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Must contain only letters, numbers, hyphens, or underscores",
      ),

    // UTC ISO 8601 datetime — Zod .datetime() rejects non-UTC offsets
    startTime: z
      .string()
      .datetime({ message: "startTime must be a valid ISO 8601 UTC datetime" })
      .refine(
        (val) => new Date(val) > new Date(),
        "startTime must be in the future",
      ),

    guestName: z.string().min(1).max(200).trim(),

    guestEmail: z.string().email().toLowerCase(),

    // Strip HTML tags to prevent stored XSS when dashboard renders the note
    guestNote: z
      .string()
      .max(1000)
      .transform((val) => val.replace(/<[^>]*>/g, "").trim())
      .optional(),

    // Validated IANA timezone string (e.g. "America/New_York")
    guestTimezone: z.string().refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone"),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Path param for PATCH /public/bookings/:id/cancel
 */
export const guestCancelParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

/**
 * Body for PATCH /public/bookings/:id/cancel
 */
export const guestCancelBodySchema = z
  .object({
    reason: z
      .string()
      .max(500)
      .transform((val) => val.replace(/<[^>]*>/g, "").trim())
      .optional(),
  })
  .strict();
