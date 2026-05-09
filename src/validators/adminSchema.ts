import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const adminUpdatePlanSchema = z.object({
  plan: z.enum(["FREE", "PRO", "BUSINESS"]),
});

export const adminInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

export const adminAcceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12, "Password must be at least 12 characters"),
});
