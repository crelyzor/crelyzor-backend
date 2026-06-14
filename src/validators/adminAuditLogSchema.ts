import { z } from "zod";

export const listAuditLogSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  targetId: z.string().uuid().optional(),
});
