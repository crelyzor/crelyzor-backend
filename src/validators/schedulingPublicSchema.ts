import { z } from "zod";

// Alphanumeric + underscore + hyphen — matches the slug/username format used elsewhere
const publicIdentifier = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Must contain only letters, numbers, hyphens, or underscores",
  );

// YYYY-MM-DD with basic validity check (rejects "2025-02-30" etc.)
const futureDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((d) => !isNaN(Date.parse(d)), "Date must be a valid calendar date")
  .refine(
    (d) => d >= new Date().toISOString().slice(0, 10),
    "Date cannot be in the past",
  );

/**
 * Path params for GET /public/scheduling/slots/:username/:eventTypeSlug
 */
export const getSlotsParamSchema = z.object({
  username: publicIdentifier,
  eventTypeSlug: publicIdentifier,
});

/**
 * Query params for GET /public/scheduling/slots/:username/:eventTypeSlug?date=...
 */
export const getSlotsQuerySchema = z
  .object({
    date: futureDateString,
  })
  .strict();

/**
 * Path params for GET /public/scheduling/profile/:username
 */
export const usernameParamSchema = z.object({
  username: publicIdentifier,
});

export type GetSlotsParamInput = z.infer<typeof getSlotsParamSchema>;
export type GetSlotsQueryInput = z.infer<typeof getSlotsQuerySchema>;
