import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  listBookingsQuerySchema,
  bookingIdParamSchema,
  cancelBookingBodySchema,
  declineBookingBodySchema,
} from "../validators/bookingManagementSchema";
import * as bookingManagementService from "../services/scheduling/bookingManagementService";

export const listBookings = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const query = listBookingsQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError("Validation failed", 400);

  const result = await bookingManagementService.listBookings(
    userId,
    query.data,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Bookings fetched",
    data: result,
  });
};

export const confirmBooking = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = bookingIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid booking ID", 400);

  const booking = await bookingManagementService.confirmBooking(
    userId,
    params.data.id,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Booking confirmed",
    data: { booking },
  });
};

export const declineBooking = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = bookingIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid booking ID", 400);

  const body = declineBookingBodySchema.safeParse(req.body);
  if (!body.success) throw new AppError("Validation failed", 400);

  const booking = await bookingManagementService.declineBooking(
    userId,
    params.data.id,
    body.data.reason,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Booking declined",
    data: { booking },
  });
};

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
