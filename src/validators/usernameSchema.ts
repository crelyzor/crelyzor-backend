import { z } from "zod";

const usernameField = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Username must be lowercase alphanumeric with hyphens, cannot start or end with a hyphen",
  )
  .regex(/^(?!.*--)/, "Username cannot contain consecutive hyphens");

export const usernameSchema = z.object({
  username: usernameField,
});

export const checkUsernameSchema = z.object({
  username: usernameField,
});
