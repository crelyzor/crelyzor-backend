import { z } from "zod";

// HH:MM 24-hour format: 00:00 – 23:59
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format (e.g. 09:00)");

// YYYY-MM-DD with validity check (rejects "2025-02-30" etc.)
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((d) => {
    const parsed = Date.parse(d);
    return !isNaN(parsed);
  }, "Date must be a valid calendar date");

// Single-object day schema — either { isOff: true } or { startTime, endTime }
export const availabilityDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    isOff: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.isOff === true ||
      (d.startTime !== undefined && d.endTime !== undefined),
    {
      message:
        "Either isOff: true or both startTime and endTime are required",
    },
  )
  .refine(
    (d) => !d.startTime || !d.endTime || d.startTime < d.endTime,
    { message: "startTime must be before endTime", path: ["startTime"] },
  );

export const patchAvailabilitySchema = z
  .object({
    days: z
      .array(availabilityDaySchema)
      .min(1, "At least one day is required")
      .max(7, "Cannot update more than 7 days at once"),
  })
  .refine(
    (data) => {
      const days = data.days.map((d) => d.dayOfWeek);
      return new Set(days).size === days.length;
    },
    { message: "Duplicate dayOfWeek values are not allowed", path: ["days"] },
  );

export const createOverrideSchema = z.object({
  date: dateString,
  isBlocked: z.boolean().default(true),
});

export const overrideIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export type PatchAvailabilityDayInput = z.infer<typeof availabilityDaySchema>;
export type PatchAvailabilityInput = z.infer<typeof patchAvailabilitySchema>;
export type CreateOverrideInput = z.infer<typeof createOverrideSchema>;
