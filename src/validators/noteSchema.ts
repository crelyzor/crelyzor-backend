import { z } from "zod";

export const noteSchema = z.object({
  content: z.string().min(1).max(10000),
  timestamp: z.number().optional(),
});

export type NoteInput = z.infer<typeof noteSchema>;

export const notesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
