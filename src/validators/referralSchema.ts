import { z } from "zod";

export const ReferralInviteSchema = z.object({
  inviteeEmail: z.string().email("Invalid email address"),
});

export const ResendInviteSchema = z.object({
  inviteId: z.string().uuid("Invalid invite ID"),
});
