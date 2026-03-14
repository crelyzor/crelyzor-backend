import { z } from "zod";

const uuidParam = z.string().uuid("Invalid ID format");

export const tagParamSchema = z.object({
  tagId: uuidParam,
});

export const meetingIdParamSchema = z.object({
  meetingId: uuidParam,
});

export const cardIdParamSchema = z.object({
  cardId: uuidParam,
});

export const tagMeetingParamSchema = z.object({
  meetingId: uuidParam,
  tagId: uuidParam,
});

export const tagCardParamSchema = z.object({
  cardId: uuidParam,
  tagId: uuidParam,
});

export const DEFAULT_TAG_COLOR = "#6b7280";

export const createTagSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long").trim(),
  color: z
    .string()
    .regex(
      /^#[0-9A-Fa-f]{6}$/,
      "Color must be a valid hex color (e.g. #FF5733)",
    )
    .default(DEFAULT_TAG_COLOR),
});

export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color")
    .optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
