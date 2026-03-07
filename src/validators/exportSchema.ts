import { z } from "zod";

export const exportParamSchema = z.object({
  meetingId: z.string().uuid("meetingId must be a valid UUID"),
});

export const exportQuerySchema = z.object({
  format: z.enum(["pdf", "txt"], {
    errorMap: () => ({ message: 'format must be "pdf" or "txt"' }),
  }),
  content: z.enum(["transcript", "summary"], {
    errorMap: () => ({ message: 'content must be "transcript" or "summary"' }),
  }),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;
