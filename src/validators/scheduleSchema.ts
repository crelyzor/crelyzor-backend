import { z } from "zod";

const timeString = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Time must be in HH:MM format (e.g. 09:00)",
  );

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((d) => !isNaN(Date.parse(d)), "Date must be a valid calendar date");

export const createScheduleSchema = z
  .object({
    name: z.string().min(1).max(100),
    timezone: z.string().min(1).max(100),
  })
  .strict();

export const updateScheduleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    timezone: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.timezone !== undefined, {
    message: "At least one of name or timezone is required",
  });

export const copyScheduleSchema = z
  .object({ name: z.string().min(1).max(100) })
  .strict();

export const scheduleIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export const slotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeString,
    endTime: timeString,
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "startTime must be before endTime",
    path: ["startTime"],
  });

export const patchSlotsSchema = z.object({
  slots: z.array(slotSchema),
});

export const createScheduleOverrideSchema = z
  .object({
    date: dateString,
    isBlocked: z.boolean().default(true),
  })
  .strict();

export const scheduleOverrideParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  overrideId: z.string().uuid("overrideId must be a valid UUID"),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CopyScheduleInput = z.infer<typeof copyScheduleSchema>;
export type SlotInput = z.infer<typeof slotSchema>;
export type PatchSlotsInput = z.infer<typeof patchSlotsSchema>;
export type CreateScheduleOverrideInput = z.infer<
  typeof createScheduleOverrideSchema
>;
