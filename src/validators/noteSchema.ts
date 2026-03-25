import { z } from "zod";

export const noteSchema = z.object({
  content: z.string().min(1).max(10000),
  timestamp: z.number().optional(),
});

export type NoteInput = z.infer<typeof noteSchema>;
