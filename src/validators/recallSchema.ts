import { z } from "zod";

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
