import { MeetingStatus } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { ListBookingsFilters } from "../../validators/bookingManagementSchema";
import { deleteCalendarEvent } from "../googleCalendarService";

// Fields returned for each booking in the list
const BOOKING_LIST_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  status: true,
  timezone: true,
  guestName: true,
  guestEmail: true,
  guestNote: true,
  cancelReason: true,
  canceledAt: true,
  createdAt: true,
  // userId, isDeleted, deletedAt, googleEventId intentionally omitted
  eventType: {
    select: {
      id: true,
      title: true,
      slug: true,
      duration: true,
      locationType: true,
    },
  },
} as const;

// Fields returned after cancellation to confirm the new state
const BOOKING_CANCEL_SELECT = {
  id: true,
  status: true,
  cancelReason: true,
  canceledAt: true,
} as const;

/**
 * Returns a paginated list of the host's bookings, optionally filtered by
 * status and/or date range.
 *
 * NOTE: `from`/`to` filters use UTC midnight boundaries (Phase 1 simplification).
 * Hosts in non-UTC timezones may see a ±1 day boundary difference. This is a
 * known limitation and acceptable for V1.
 */
export async function listBookings(userId: string, filters: ListBookingsFilters) {
  const { status, from, to, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    isDeleted: false,
    ...(status && { status }),
    ...((from || to) && {
      startTime: {
        ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
      },
    }),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      select: BOOKING_LIST_SELECT,
      orderBy: { startTime: "asc" },
      skip,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    bookings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Cancels a booking as the host. Returns the updated booking fields.
 *
 * Only CONFIRMED and RESCHEDULED bookings can be cancelled.
 * NO_SHOW and CANCELLED are terminal states.
 */
export async function cancelBooking(
  userId: string,
  bookingId: string,
  reason?: string,
) {
  // Ownership check: booking must belong to this host
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, isDeleted: false },
    // googleEventId used internally for GCal cleanup — never returned in response
    select: { id: true, status: true, meetingId: true, googleEventId: true },
  });

  if (!booking) throw new AppError("Booking not found", 404);

  // Explicit status guards with accurate messages
  if (booking.status === "CANCELLED") {
    throw new AppError("Booking is already cancelled", 409);
  }
  if (booking.status === "NO_SHOW") {
    throw new AppError("No-show bookings cannot be cancelled", 409);
  }
  // Covers CONFIRMED and RESCHEDULED — both are active states the host can cancel

  await prisma.$transaction(
    async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          cancelReason: reason ?? null,
          canceledAt: new Date(),
        },
      });

      // Cancel the linked Meeting if one exists
      if (booking.meetingId) {
        await tx.meeting.update({
          where: { id: booking.meetingId },
          data: { status: MeetingStatus.CANCELLED },
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("Booking cancelled by host", { bookingId, userId });

  // Google Calendar write sync — fail-open: booking is already cancelled in DB.
  // GCal call is outside the transaction to avoid DB lock inflation and to
  // ensure a GCal failure does not roll back the confirmed cancellation.
  await deleteCalendarEvent(userId, booking.googleEventId);

  // Return updated state so the controller can confirm to the caller without a second query
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: BOOKING_CANCEL_SELECT,
  });
}
