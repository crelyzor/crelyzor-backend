import { z } from "zod";

export const meetingIdParamSchema = z.object({
  meetingId: z.string().uuid("meetingId must be a valid UUID"),
});

export const shortIdParamSchema = z.object({
  shortId: z
    .string()
    .min(6)
    .max(16)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid share ID"),
});

export const updateShareSchema = z
  .object({
    isPublic: z.boolean().optional(),
    showTranscript: z.boolean().optional(),
    showSummary: z.boolean().optional(),
    showTasks: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateShareInput = z.infer<typeof updateShareSchema>;
