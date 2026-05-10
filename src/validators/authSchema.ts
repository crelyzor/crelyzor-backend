import { z } from "zod";

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .max(1000, "Invalid refresh token format")
    .optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().max(1000, "Invalid refresh token format").optional(),
  logoutAll: z.boolean().optional().default(false),
});
