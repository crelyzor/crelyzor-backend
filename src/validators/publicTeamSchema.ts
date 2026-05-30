import { z } from "zod";

const slugPattern = /^[a-z0-9-]+$/;

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(1, "slug is required")
    .max(80)
    .regex(slugPattern, "slug must be lowercase alphanumeric with hyphens"),
});

export const slugUsernameParamSchema = z.object({
  slug: z
    .string()
    .min(1, "slug is required")
    .max(80)
    .regex(slugPattern, "slug must be lowercase alphanumeric with hyphens"),
  username: z
    .string()
    .min(1, "username is required")
    .max(80)
    .regex(slugPattern, "username must be lowercase alphanumeric with hyphens"),
});
