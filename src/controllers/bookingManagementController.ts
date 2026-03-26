import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  listBookingsQuerySchema,
  bookingIdParamSchema,
  cancelBookingBodySchema,
} from "../validators/bookingManagementSchema";
import * as bookingManagementService from "../services/scheduling/bookingManagementService";

/**
 * GET /scheduling/bookings
 *
 * Returns a paginated list of the authenticated host's bookings.
 * Supports optional filters: status, from (YYYY-MM-DD), to (YYYY-MM-DD), page, limit.
 */
export const listBookings = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const query = listBookingsQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError("Validation failed", 400);

  const result = await bookingManagementService.listBookings(userId, query.data);

  return apiResponse(res, {
    statusCode: 200,
    message: "Bookings fetched",
    data: result,
  });
};

/**
 * PATCH /scheduling/bookings/:id/cancel
 *
 * Cancels a confirmed or rescheduled booking as the host.
 * Updates both the Booking status and the linked Meeting status to CANCELLED.
 */
export const cancelBooking = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = bookingIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid booking ID", 400);

  const body = cancelBookingBodySchema.safeParse(req.body);
  if (!body.success) throw new AppError("Validation failed", 400);

  const booking = await bookingManagementService.cancelBooking(
    userId,
    params.data.id,
    body.data.reason,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Booking cancelled",
    data: { booking },
  });
};
