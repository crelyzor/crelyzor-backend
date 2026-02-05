import { z } from "zod";

export const getEventsByDateSchema = z.object({
  date: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid date format. Please provide a valid ISO date string",
    })
    .transform((date) => new Date(date)),
});

export const createEventSchema = z.object({
  name: z
    .string()
    .min(1, "Event name is required")
    .max(255, "Event name too long"),
  description: z.string().min(1, "Event description is required"),
  date: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid date format. Please provide a valid ISO date string",
    })
    .transform((date) => new Date(date)),
  startTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  endTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  meetingLink: z.string().url("Invalid meeting link URL").optional(),
  isSuggested: z.boolean().default(false),
});
