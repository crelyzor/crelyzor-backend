import { z } from "zod";

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(100).default("Working Hours"),
  timezone: z.string().default("UTC"),
});

export const updateScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
