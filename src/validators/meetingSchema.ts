import { z } from "zod";

export const createMeetingSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must be less than 255 characters"),
    description: z.string().optional(),
    startTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid start time")
      .transform((date) => new Date(date)),
    endTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid end time")
      .transform((date) => new Date(date)),
    timezone: z.string().default("UTC"),
    location: z.string().optional(),
    participantUserIds: z
      .array(z.string().uuid("Invalid participant ID format"))
      .optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  });

export const meetingActionSchema = z.object({
  reason: z.string().optional(),
});

export const getMeetingsSchema = z.object({
  status: z.enum(["CREATED", "COMPLETED", "CANCELLED"]).optional(),
  startDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid start date")
    .transform((date) => (date ? new Date(date) : undefined)),
  endDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid end date")
    .transform((date) => (date ? new Date(date) : undefined)),
  limit: z.coerce.number().int().positive().optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export const getMeetingsWithoutPaginationSchema = z.object({
  status: z.enum(["CREATED", "COMPLETED", "CANCELLED"]).optional(),
  startDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid start date")
    .transform((date) => (date ? new Date(date) : undefined)),
  endDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid end date")
    .transform((date) => (date ? new Date(date) : undefined)),
});

export const updateMeetingSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must be less than 255 characters")
      .optional(),
    description: z.string().optional(),
    startTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid start time")
      .transform((date) => new Date(date))
      .optional(),
    endTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid end time")
      .transform((date) => new Date(date))
      .optional(),
    timezone: z.string().optional(),
    location: z.string().optional(),
    participantUserIds: z
      .array(z.string().uuid("Invalid participant ID format"))
      .optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
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

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type GetMeetingsInput = z.infer<typeof getMeetingsSchema>;
