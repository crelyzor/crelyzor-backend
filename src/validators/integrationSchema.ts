import { z } from "zod";

const MAX_RANGE_DAYS = 60;
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

const isoDatetime = z
  .string()
  .refine((v) => !isNaN(Date.parse(v)), "Must be a valid ISO datetime string")
  .transform((v) => new Date(v));

/**
 * Query params for GET /integrations/google/events
 * - start / end must be valid ISO datetime strings
 * - end must be after start
 * - Range cannot exceed 60 days (prevents unbounded Google API queries)
 */
export const getCalendarEventsSchema = z
  .object({
    start: isoDatetime,
    end: isoDatetime,
  })
  .refine((d) => d.end > d.start, {
    message: "end must be after start",
    path: ["end"],
  })
  .refine((d) => d.end.getTime() - d.start.getTime() <= MAX_RANGE_MS, {
    message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
    path: ["end"],
  });

export type GetCalendarEventsInput = z.infer<typeof getCalendarEventsSchema>;
