import { z } from "zod";

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const createRecurringAvailabilitySchema = z
  .object({
    dayOfWeek: z.enum([
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ]),
    startTime: z
      .string()
      .regex(TIME_REGEX, "Time format must be HH:MM (e.g., 09:00, 14:30)"),
    endTime: z
      .string()
      .regex(TIME_REGEX, "Time format must be HH:MM (e.g., 09:00, 14:30)"),
    timezone: z.string().default("UTC"),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  });

// For updates, all fields are optional (update only what you need)
export const updateRecurringAvailabilitySchema = z
  .object({
    dayOfWeek: z
      .enum([
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
      ])
      .optional(),
    startTime: z
      .string()
      .regex(TIME_REGEX, "Time format must be HH:MM (e.g., 09:00, 14:30)")
      .optional(),
    endTime: z
      .string()
      .regex(TIME_REGEX, "Time format must be HH:MM (e.g., 09:00, 14:30)")
      .optional(),
    timezone: z.string().optional(),
  })
  .refine(
    (data) => {
      // If both times provided, validate startTime < endTime
      if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
      }
      return true;
    },
    {
      message: "Start time must be before end time",
      path: ["endTime"],
    },
  );

export const createCustomSlotSchema = z
  .object({
    date: z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), "Invalid date")
      .transform((d) => new Date(d)),
    startTime: z
      .string()
      .regex(TIME_REGEX, "Time format must be HH:MM (e.g., 09:00, 14:30)"),
    endTime: z
      .string()
      .regex(TIME_REGEX, "Time format must be HH:MM (e.g., 09:00, 14:30)"),
    timezone: z.string().default("UTC"),
    notes: z.string().optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  });

export const createBlockedTimeSchema = z
  .object({
    startTime: z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), "Invalid start time")
      .transform((d) => new Date(d)),
    endTime: z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), "Invalid end time")
      .transform((d) => new Date(d)),
    reason: z.string().optional(),
    recurrenceRule: z.enum(["NONE", "WEEKLY", "MONTHLY"]).default("NONE"),
    recurrenceEnd: z
      .string()
      .optional()
      .refine((d) => !d || !isNaN(Date.parse(d)), "Invalid recurrence end date")
      .transform((d) => (d ? new Date(d) : undefined)),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  });

export const getAvailableSlotsSchema = z.object({
  startDate: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid start date")
    .transform((d) => new Date(d)),
  endDate: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid end date")
    .transform((d) => new Date(d)),
  slotDuration: z.number().int().positive().optional().default(30), // minutes
});

export const createBatchRecurringAvailabilitySchema = z.object({
  slots: z
    .array(createRecurringAvailabilitySchema)
    .min(1, "At least one slot is required"),
});

export type CreateRecurringAvailabilityInput = z.infer<
  typeof createRecurringAvailabilitySchema
>;
export type UpdateRecurringAvailabilityInput = z.infer<
  typeof updateRecurringAvailabilitySchema
>;
export type CreateCustomSlotInput = z.infer<typeof createCustomSlotSchema>;
export type CreateBlockedTimeInput = z.infer<typeof createBlockedTimeSchema>;
export type GetAvailableSlotsInput = z.infer<typeof getAvailableSlotsSchema>;
export type CreateBatchRecurringAvailabilityInput = z.infer<
  typeof createBatchRecurringAvailabilitySchema
>;
