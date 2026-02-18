import { z } from "zod";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createEventTypeSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(SLUG_REGEX, "Slug must be lowercase alphanumeric with hyphens")
    .max(100)
    .optional(),
  description: z.string().max(2000).optional(),
  duration: z.number().int().min(5).max(480), // 5 min to 8 hours
  scheduleId: z.string().uuid(),
  bufferBefore: z.number().int().min(0).max(120).default(0),
  bufferAfter: z.number().int().min(0).max(120).default(0),
  minNotice: z.number().int().min(0).max(720).default(24), // hours (max 30 days)
  maxAdvance: z.number().int().min(1).max(365).default(60), // days
});

export const updateEventTypeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .regex(SLUG_REGEX, "Slug must be lowercase alphanumeric with hyphens")
    .max(100)
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  duration: z.number().int().min(5).max(480).optional(),
  scheduleId: z.string().uuid().optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
  minNotice: z.number().int().min(0).max(720).optional(),
  maxAdvance: z.number().int().min(1).max(365).optional(),
  isActive: z.boolean().optional(),
});

export const publicBookingRequestSchema = z.object({
  startTime: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid start time")
    .transform((d) => new Date(d)),
  endTime: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid end time")
    .transform((d) => new Date(d)),
  guestEmail: z.string().email(),
  guestName: z.string().min(1).max(200),
  guestMessage: z.string().max(1000).optional(),
  timezone: z.string().default("UTC"),
});

export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;
export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;
export type PublicBookingRequestInput = z.infer<
  typeof publicBookingRequestSchema
>;
