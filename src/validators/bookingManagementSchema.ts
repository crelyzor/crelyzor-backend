import { z } from "zod";

// YYYY-MM-DD with validity check
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine((d) => !isNaN(Date.parse(d)), "Date must be a valid calendar date");

/**
 * Query params for GET /scheduling/bookings
 */
export const listBookingsQuerySchema = z
  .object({
    status: z
      .enum(["PENDING", "CONFIRMED", "DECLINED", "CANCELLED", "RESCHEDULED", "NO_SHOW"])
      .optional(),
    // Date range filters use UTC midnight boundaries (V1 simplification).
    // Hosts in non-UTC timezones may see slight boundary differences — acceptable for V1.
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/**
 * Path param for PATCH /scheduling/bookings/:id/cancel
 */
export const bookingIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

/**
 * Body for PATCH /scheduling/bookings/:id/cancel
 */
export const cancelBookingBodySchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

/**
 * Body for POST /scheduling/bookings/:id/decline
 */
export const declineBookingBodySchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export type ListBookingsFilters = z.infer<typeof listBookingsQuerySchema>;
export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;
export type DeclineBookingBody = z.infer<typeof declineBookingBodySchema>;
