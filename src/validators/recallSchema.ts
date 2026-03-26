import { z } from "zod";

/**
 * PUT /settings/recall-api-key
 * Saves the user's Recall.ai API key (encrypted at rest).
 * The key is never returned in any response.
 */
export const saveRecallApiKeySchema = z
  .object({
    apiKey: z
      .string()
      .min(16, "Recall.ai API key must be at least 16 characters")
      .max(512, "Recall.ai API key too long"),
  })
  .strict();

export type SaveRecallApiKeyInput = z.infer<typeof saveRecallApiKeySchema>;

/**
 * Recall.ai webhook event payload shape.
 * Used to validate the inbound webhook body before acting on it.
 */
export const recallWebhookSchema = z.object({
  event: z.string().min(1),
  data: z
    .object({
      bot_id: z.string().min(1),
      status: z
        .object({
          code: z.string().min(1),
          sub_code: z.string().nullable().optional(),
          message: z.string().nullable().optional(),
        })
        .optional(),
    })
    .passthrough(), // Recall may add more fields — passthrough for forward compatibility
});

export type RecallWebhookEvent = z.infer<typeof recallWebhookSchema>;
