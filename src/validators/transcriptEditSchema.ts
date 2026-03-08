import { z } from "zod";

export const patchSegmentBodySchema = z.object({
  text: z.string().min(1).max(10000),
});

export const patchSummaryBodySchema = z
  .object({
    summary: z.string().min(1).optional(),
    keyPoints: z.array(z.string().min(1)).optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .refine(
    (data) =>
      data.summary !== undefined ||
      data.keyPoints !== undefined ||
      data.title !== undefined,
    { message: "At least one field must be provided" },
  );

export type PatchSegmentInput = z.infer<typeof patchSegmentBodySchema>;
export type PatchSummaryInput = z.infer<typeof patchSummaryBodySchema>;
