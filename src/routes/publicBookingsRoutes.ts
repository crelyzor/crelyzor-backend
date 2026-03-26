import { Router } from "express";
import { bookingLimiter } from "../utils/rateLimit/rateLimiter";
import * as bookingController from "../controllers/bookingController";

const publicBookingsRouter = Router();

// All routes here are public — no auth required

/**
 * POST /api/v1/public/bookings
 *
 * Creates a confirmed booking. Rate-limited to 10 requests/hour per IP to
 * prevent calendar flooding. Slot availability is re-validated inside a
 * Serializable transaction — a 409 response means the slot was taken.
 */
publicBookingsRouter.post("/bookings", bookingLimiter, bookingController.createBooking);

/**
 * PATCH /api/v1/public/bookings/:id/cancel
 *
 * Cancels a booking as the guest. No auth required — the booking UUID is the
 * guest's authorization token (standard Cal.com/Calendly pattern).
 * Rate-limited to prevent enumeration attacks.
 */
publicBookingsRouter.patch(
  "/bookings/:id/cancel",
  bookingLimiter,
  bookingController.cancelBookingAsGuest,
);

export default publicBookingsRouter;
