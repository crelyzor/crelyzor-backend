import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  createBookingSchema,
  guestCancelBodySchema,
  guestCancelParamSchema,
} from "../validators/bookingSchema";
import * as bookingService from "../services/scheduling/bookingService";

/**
 * POST /public/bookings
 *
 * Creates a confirmed booking for a guest. No auth required.
 * Re-validates slot availability inside a Serializable transaction to prevent
 * double-bookings under concurrent requests.
 */
export const createBooking = async (req: Request, res: Response) => {
  const validated = createBookingSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const result = await bookingService.createBooking(validated.data);

  return apiResponse(res, {
    statusCode: 201,
    message: "Booking confirmed",
    data: result,
  });
};

/**
 * PATCH /public/bookings/:id/cancel
 *
 * Cancels a booking as the guest. No auth required — the booking UUID
 * serves as the guest's authorization token (Cal.com/Calendly pattern).
 */
export const cancelBookingAsGuest = async (req: Request, res: Response) => {
  const params = guestCancelParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid booking ID", 400);

  const body = guestCancelBodySchema.safeParse(req.body);
  if (!body.success) throw new AppError("Validation failed", 400);

  const booking = await bookingService.cancelBookingAsGuest(
    params.data.id,
    body.data.reason,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Booking cancelled",
    data: { booking },
  });
};

/**
 * GET /public/bookings/:id
 *
 * Returns limited booking details for public display (e.g. for the cancellation page).
 */
export const getPublicBookingDetails = async (req: Request, res: Response) => {
  const params = guestCancelParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid booking ID", 400);

  const username = typeof req.query.username === "string" ? req.query.username : undefined;
  const slug = typeof req.query.slug === "string" ? req.query.slug : undefined;

  const booking = await bookingService.getPublicBooking(params.data.id, username, slug);

  return apiResponse(res, {
    statusCode: 200,
    message: "Booking details fetched",
    data: { booking },
  });
};
