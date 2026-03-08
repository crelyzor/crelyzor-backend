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

// BCP 47 language tag: 2-3 letter primary subtag with optional subtags (e.g. "en", "en-US", "pt-BR")
export const changeLanguageSchema = z.object({
  language: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, {
      message: "language must be a valid BCP 47 tag (e.g. en, en-US, pt-BR)",
    }),
});

export type PatchSegmentInput = z.infer<typeof patchSegmentBodySchema>;
export type PatchSummaryInput = z.infer<typeof patchSummaryBodySchema>;
export type ChangeLanguageInput = z.infer<typeof changeLanguageSchema>;
