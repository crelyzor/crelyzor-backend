import { z } from "zod";

export const askAISchema = z.object({
  question: z
    .string()
    .min(1, "Question is required")
    .max(1000, "Question too long"),
});

export type AskAIInput = z.infer<typeof askAISchema>;
