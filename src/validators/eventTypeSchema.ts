import { z } from "zod";
import { LocationType } from "@prisma/client";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Validates a URL is http or https to prevent SSRF / XSS via stored URLs
const safeUrl = z
  .string()
  .url("meetingLink must be a valid URL")
  .refine(
    (url) => {
      try {
        const { protocol } = new URL(url);
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    },
    "meetingLink must use http or https",
  );

export const createEventTypeSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(100, "Title too long").trim(),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(60, "Slug too long")
      .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens (e.g. 30-min-call)"),
    description: z.string().max(500, "Description too long").trim().optional(),
    duration: z
      .number()
      .int()
      .min(5, "Duration must be at least 5 minutes")
      .max(480, "Duration cannot exceed 480 minutes (8 hours)"),
    locationType: z.nativeEnum(LocationType).default(LocationType.IN_PERSON),
    meetingLink: safeUrl.optional(),
    bufferBefore: z.number().int().min(0).max(120).default(0),
    bufferAfter: z.number().int().min(0).max(120).default(0),
    maxPerDay: z.number().int().min(1).max(50).optional(),
    isActive: z.boolean().default(true),
    availabilityScheduleId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.locationType === LocationType.ONLINE) {
        return !!data.meetingLink;
      }
      return true;
    },
    { message: "meetingLink is required when locationType is ONLINE", path: ["meetingLink"] },
  );

export const updateEventTypeSchema = z
  .object({
    title: z.string().min(1).max(100).trim().optional(),
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens")
      .optional(),
    description: z.string().max(500).trim().optional(),
    duration: z.number().int().min(5).max(480).optional(),
    locationType: z.nativeEnum(LocationType).optional(),
    meetingLink: safeUrl.nullable().optional(), // null = clear the link
    bufferBefore: z.number().int().min(0).max(120).optional(),
    bufferAfter: z.number().int().min(0).max(120).optional(),
    maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
    isActive: z.boolean().optional(),
    availabilityScheduleId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const eventTypeIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;
export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;
