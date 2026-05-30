import { z } from "zod";

export const teamIdParamSchema = z.object({
  teamId: z.string().uuid("teamId must be a valid UUID"),
});

const stringBool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"));

export const listTeamsQuerySchema = z.object({
  include_deleted: stringBool.optional().default(false),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;
