import { z } from "zod";

// SystemConfig keys are free-form strings (e.g. `max_teams_per_pro_user`,
// `team_invite_expiry_days`). Length cap is defensive.
export const configKeyParamSchema = z.object({
  key: z
    .string()
    .min(1, "key is required")
    .max(128, "key too long")
    .regex(
      /^[a-z0-9_]+$/,
      "key must be lowercase alphanumeric with underscores",
    ),
});

export const updateConfigSchema = z.object({
  value: z.string().min(1, "value is required").max(4096, "value too long"),
});

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
