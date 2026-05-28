import { z } from "zod";

export const listNotificationsSchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Invalid notification id"),
});
