import { z } from "zod";

export const renameSpeakerSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    role: z.string().min(1).max(100).optional(),
  })
  .refine((data) => data.displayName !== undefined || data.role !== undefined, {
    message: "At least one of displayName or role must be provided",
  });
