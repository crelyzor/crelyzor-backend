import { z } from "zod";

// ── Param schemas ─────────────────────────────────────────────────────────────

export const attachmentMeetingParamSchema = z.object({
  meetingId: z.string().uuid("Invalid meeting ID"),
});

export const attachmentIdParamSchema = z.object({
  meetingId: z.string().uuid("Invalid meeting ID"),
  attachmentId: z.string().uuid("Invalid attachment ID"),
});

// ── SSRF-safe URL validator ────────────────────────────────────────────────────
// Block private networks, localhost, and non-http(s) schemes to prevent
// server-side request forgery if links are ever fetched or previewed.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // GCP/AWS metadata endpoint
  /^::1$/,
  /^\[::1\]/,
  /^0\.0\.0\.0$/,
];

const safePublicUrl = z
  .string()
  .url("Must be a valid URL")
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        if (!["https:", "http:"].includes(parsed.protocol)) return false;
        const host = parsed.hostname;
        return !BLOCKED_HOST_PATTERNS.some((p) => p.test(host));
      } catch {
        return false;
      }
    },
    { message: "URL must be a public http(s) address" }
  );

// ── Body schemas ──────────────────────────────────────────────────────────────

export const addLinkSchema = z.object({
  url: safePublicUrl,
  name: z.string().min(1).max(200).trim().optional(),
});

export type AddLinkInput = z.infer<typeof addLinkSchema>;
