import { z } from "zod";

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "billing",
  "cards",
  "integrations",
  "invite",
  "invites",
  "meetings",
  "public",
  "schedule",
  "scheduling",
  "search",
  "settings",
  "sma",
  "storage",
  "tags",
  "teams",
  "users",
  "webhooks",
  "me",
  "new",
  "t",
]);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(40, "Slug must be at most 40 characters")
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => SLUG_REGEX.test(s), {
    message:
      "Slug must contain only lowercase letters, digits, and dashes (no leading or trailing dash)",
  })
  .refine((s) => !RESERVED_SLUGS.has(s), {
    message: "Slug is reserved",
  });

export const createTeamSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
});

// Slug change is gated to OWNER inside the service — surfaced here as optional.
export const updateTeamSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(500).nullable().optional(),
    logoUrl: z.string().url().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid("Invalid user id"),
  teamNameConfirm: z.string().min(1, "Team name confirmation required"),
});

export const teamIdParamSchema = z.object({
  teamId: z.string().uuid("Invalid team id"),
});

export const memberIdParamSchema = z.object({
  teamId: z.string().uuid("Invalid team id"),
  userId: z.string().uuid("Invalid user id"),
});

// OWNER is intentionally excluded — promotion to OWNER must go through
// POST /teams/:teamId/transfer-ownership (which carries the teamNameConfirm
// guard and the old-owner demotion cascade). PATCH /members/:userId can only
// shuffle non-owner roles.
export const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const updateMemberDesignationSchema = z.object({
  designation: z.string().max(100).nullable(),
});

export type UpdateMemberDesignationInput = z.infer<
  typeof updateMemberDesignationSchema
>;

// ── Invites ──────────────────────────────────────────────────────────────────

const inviteRoleSchema = z.enum(["ADMIN", "MEMBER"]);

// Reject ASCII control characters (except \t \n \r) so a malicious or pasted
// message can't smuggle weird bytes into the rendered email. HTML escape is
// the email template's responsibility — this is the input-shape guard.
// Build the regex at runtime so the source has only printable ASCII —
// matches ASCII control chars 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F.
const CONTROL_CHAR_REGEX = new RegExp(
  "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]",
);

const inviteMessageSchema = z
  .string()
  .max(500)
  .refine((s) => !CONTROL_CHAR_REGEX.test(s), {
    message: "Message contains invalid characters",
  })
  .transform((s) => s.trim())
  .optional();

const emailListSchema = z
  .array(z.string().email().max(254))
  .min(1, "At least one email is required")
  .max(10, "Up to 10 emails per batch");

export const createInviteSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("user"),
    userId: z.string().uuid("Invalid user id"),
    role: inviteRoleSchema,
    message: inviteMessageSchema,
  }),
  z.object({
    mode: z.literal("email"),
    emails: emailListSchema,
    role: inviteRoleSchema,
    message: inviteMessageSchema,
  }),
]);

export const inviteIdParamSchema = z.object({
  teamId: z.string().uuid("Invalid team id"),
  inviteId: z.string().uuid("Invalid invite id"),
});

export const tokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid invite token"),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
