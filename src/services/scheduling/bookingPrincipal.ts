/**
 * Pure helpers for booking team-scope + encryption principal derivation.
 *
 * Lives in its own module (no Prisma client, no service-graph imports) so
 * it can be imported by:
 *   - bookingManagementService (host-side mutations)
 *   - bookingService.cancelBookingAsGuest (public, no auth)
 *   - worker/jobProcessor (BOOKING_REMINDER handler — separate process)
 *
 * Keeping the helpers prisma-free avoids dragging the entire host-side
 * service surface (emails, GCal, Recall queue) into the worker startup
 * graph or the public-facing module.
 */
import type { Prisma } from "@prisma/client";
import { AppError } from "../../utils/errors/AppError";
import type { Principal } from "../../utils/security/crypto";
import type { TeamContext } from "../../middleware/authMiddleware";

/**
 * Uniform 404 message for any booking access failure. Identical body
 * collapses not-found / wrong-team / MEMBER-no-mutate-rights into one shape
 * so callers cannot enumerate state via 404-vs-403 distinctions.
 */
export const BOOKING_NOT_FOUND_MESSAGE = "Booking not found";

/**
 * Minimal shape required by access + principal helpers. Defined here (not
 * imported from Prisma) so the public/worker paths don't pull `@prisma/client`
 * into their startup graph unnecessarily.
 */
export type BookingForAccess = {
  id: string;
  userId: string;
  teamId: string | null;
};

/**
 * Phase 6 P5.4.b — Prisma `where` fragment that scopes a Booking query to
 * the actor's allowed visibility under the current team context.
 *
 * - Personal (`teamContext === null`): actor's own personal bookings only.
 *   `teamId: null` is load-bearing: without it, an actor's team bookings
 *   (as host) would leak into their personal `/scheduling/bookings`.
 *   Same bug class as cards/tasks/event-types in prior chunks.
 * - Team + ADMIN/OWNER: every team booking across every member's host slot.
 * - Team + MEMBER: own team bookings only (as host).
 *
 * Spread into a `where` clause alongside other filters:
 * `{ isDeleted: false, ...bookingScope(actor, ctx) }`.
 */
export function bookingScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.BookingWhereInput {
  if (teamContext === null) {
    return { teamId: null, userId: actorId };
  }
  if (teamContext.role === "MEMBER") {
    return { teamId: teamContext.teamId, userId: actorId };
  }
  return { teamId: teamContext.teamId };
}

/**
 * Derive the encryption principal for a booking's PII (guestName, guestEmail,
 * guestNote). Always read from the row, never from the actor — a team admin
 * confirming a member's booking must decrypt under the team DEK so other
 * admins can read it.
 *
 * `Booking.teamId` is immutable post-creation (no API path mutates it).
 *
 * Forward-compat note: pre-P5.4.c, all bookings have `teamId === null`, so
 * this returns `{type: "user", id: booking.userId}` — byte-identical to the
 * legacy `decrypt(b.*, b.userId)` call. Once P5.4.c writes `Booking.teamId`
 * on team-event-type bookings, decrypt automatically routes to the team DEK
 * with zero further changes.
 */
export function principalForBooking(booking: {
  userId: string;
  teamId: string | null;
}): Principal {
  return booking.teamId
    ? { type: "team", id: booking.teamId }
    : { type: "user", id: booking.userId };
}

/**
 * Pure access check on a pre-fetched slim row. Throws uniform 404 on any
 * failure. `_mode` accepts read/mutate for future divergence (none today).
 */
export function verifyBookingAccess(
  actorId: string,
  booking: BookingForAccess,
  teamContext: TeamContext | null,
  _mode: "read" | "mutate",
): void {
  if (teamContext === null) {
    if (booking.teamId !== null || booking.userId !== actorId) {
      throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
    }
    return;
  }
  if (booking.teamId !== teamContext.teamId) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }
  if (teamContext.role === "MEMBER" && booking.userId !== actorId) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }
}
