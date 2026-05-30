import { Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type { TeamContext } from "../../middleware/authMiddleware";
import type {
  CreateEventTypeInput,
  UpdateEventTypeInput,
} from "../../validators/eventTypeSchema";

const EVENT_TYPE_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  duration: true,
  locationType: true,
  meetingLink: true,
  bufferBefore: true,
  bufferAfter: true,
  minNoticeHours: true,
  maxPerDay: true,
  isActive: true,
  availabilityScheduleId: true,
  teamId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Uniform 404 for any access failure. Identical body collapses the
// not-found / wrong-team / MEMBER-no-mutate-rights branches into a single
// shape so probes cannot distinguish them. See P5.1.a/P5.2.a for the same
// pattern on meetings/cards.
const NOT_FOUND_MESSAGE = "Event type not found";

type EventTypeForAccess = {
  id: string;
  userId: string;
  teamId: string | null;
  meetingLink: string | null;
};

/**
 * Phase 6 P5.4.a — Prisma `where` fragment that scopes an EventType query
 * to the actor's allowed visibility under the current team context.
 *
 * - Personal (`teamContext === null`): actor-owned **personal** event types
 *   only. `teamId: null` is load-bearing: without it, an actor's own team
 *   event types would leak into their personal `GET /scheduling/event-types`
 *   (same bug class fixed for cards in P5.2.a / tasks in P5.3).
 * - Team + ADMIN/OWNER: every team event type — each member's pool included,
 *   because admins manage the team-scheduling surface.
 * - Team + MEMBER: own team event types only. Each member owns their own
 *   bookable types under the team-scheduling design — admins do not micro-
 *   manage other members' availability.
 *
 * Spread into a `where` clause alongside any other filters
 * (`{ isDeleted: false, ...eventTypeScope(actor, ctx) }`).
 */
function eventTypeScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.EventTypeWhereInput {
  if (teamContext === null) {
    return { teamId: null, userId: actorId };
  }
  if (teamContext.role === "MEMBER") {
    return { teamId: teamContext.teamId, userId: actorId };
  }
  return { teamId: teamContext.teamId };
}

/**
 * Pure access check on a pre-fetched slim row. Used by `assertEventTypeAccess`
 * and any caller that already has the row in hand.
 *
 * - Mode `"read"` and `"mutate"` collapse to the same rule for now: visibility
 *   == mutation rights under the team-scheduling design (each member's pool is
 *   their own). The mode arg is kept for future divergence (e.g. ADMIN
 *   read-only audit views in P5.4.b).
 * - Throws `AppError 404 "Event type not found"` on any failure — uniform
 *   body, no enumeration oracle.
 */
function verifyEventTypeAccess(
  actorId: string,
  et: EventTypeForAccess,
  teamContext: TeamContext | null,
  _mode: "read" | "mutate",
): void {
  if (teamContext === null) {
    if (et.teamId !== null || et.userId !== actorId) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    return;
  }
  if (et.teamId !== teamContext.teamId) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }
  if (teamContext.role === "MEMBER" && et.userId !== actorId) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }
}

/**
 * Fetch + verify access + return slim row. Mirrors `assertMeetingAccess`
 * (P5.1.a) and `assertCardAccess` (P5.2.a).
 */
async function assertEventTypeAccess(
  actorId: string,
  eventTypeId: string,
  teamContext: TeamContext | null,
  mode: "read" | "mutate",
): Promise<EventTypeForAccess> {
  const row = await prisma.eventType.findFirst({
    where: { id: eventTypeId, isDeleted: false },
    select: { id: true, userId: true, teamId: true, meetingLink: true },
  });
  if (!row) throw new AppError(NOT_FOUND_MESSAGE, 404);
  verifyEventTypeAccess(actorId, row, teamContext, mode);
  return row;
}

/**
 * Cross-tenant guard for `availabilityScheduleId`. AvailabilitySchedule is
 * user-owned (no team relation); referencing another user's schedule from
 * an EventType would (a) leak that schedule's existence, and (b) bind
 * future bookings against someone else's availability.
 *
 * Caller passes `ownerUserId`:
 * - On create: the actor (their own pool).
 * - On update: `et.userId` — admin editing a teammate's team event type
 *   must respect the teammate's schedule pool, not the admin's. Mirrors
 *   the slug-pool decision in `updateCard` (P5.2.a).
 *
 * Throws 400 on miss because `availabilityScheduleId` is client input, not
 * a resource lookup.
 */
async function assertAvailabilityScheduleOwned(
  ownerUserId: string,
  scheduleId: string,
): Promise<void> {
  const sched = await prisma.availabilitySchedule.findFirst({
    where: { id: scheduleId, userId: ownerUserId, isDeleted: false },
    select: { id: true },
  });
  if (!sched) throw new AppError("Invalid availability schedule", 400);
}

/**
 * MEMBER under team context may NOT set or change `meetingLink`. Doing so
 * would let them publish an attacker-controlled URL on a public booking
 * page rendered under the team's brand (security review must-fix from
 * P5.4.a planning). ADMIN/OWNER and personal-context callers are unaffected.
 *
 * Pass `undefined` for "not changing" — only a defined value triggers the
 * gate, so a partial PATCH that omits meetingLink passes through.
 */
function assertMemberMeetingLinkAllowed(
  teamContext: TeamContext | null,
  meetingLink: string | null | undefined,
): void {
  if (
    teamContext !== null &&
    teamContext.role === "MEMBER" &&
    meetingLink !== undefined
  ) {
    throw new AppError(
      "Only team admins can set meeting links on team event types",
      403,
    );
  }
}

export async function listEventTypes(
  userId: string,
  teamContext: TeamContext | null = null,
) {
  return prisma.eventType.findMany({
    where: { isDeleted: false, ...eventTypeScope(userId, teamContext) },
    select: EVENT_TYPE_SELECT,
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

export async function createEventType(
  userId: string,
  data: CreateEventTypeInput,
  teamContext: TeamContext | null = null,
) {
  // P5.4.a: MEMBER may create their OWN team event types — asymmetric vs
  // createCard (ADMIN+ only). Justification: team-scheduling design has
  // each member owning their bookable surface within the team, otherwise
  // admins would have to provision a member's availability for them.
  // Restriction: MEMBER cannot set meetingLink (privilege escalation —
  // would render under team brand on public booking page).
  assertMemberMeetingLinkAllowed(teamContext, data.meetingLink);

  // Cross-tenant guard: schedule must belong to the actor's own pool.
  if (data.availabilityScheduleId) {
    await assertAvailabilityScheduleOwned(userId, data.availabilityScheduleId);
  }

  try {
    const eventType = await prisma.eventType.create({
      data: {
        userId,
        teamId: teamContext?.teamId ?? null,
        title: data.title,
        slug: data.slug,
        description: data.description,
        duration: data.duration,
        locationType: data.locationType,
        meetingLink: data.meetingLink,
        bufferBefore: data.bufferBefore,
        bufferAfter: data.bufferAfter,
        minNoticeHours: data.minNoticeHours,
        maxPerDay: data.maxPerDay,
        isActive: data.isActive,
        availabilityScheduleId: data.availabilityScheduleId ?? null,
      },
      select: EVENT_TYPE_SELECT,
    });

    logger.info("Event type created", {
      eventTypeId: eventType.id,
      userId,
      teamId: teamContext?.teamId ?? null,
    });
    return eventType;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("An event type with this slug already exists", 409);
    }
    throw err;
  }
}

export async function updateEventType(
  userId: string,
  id: string,
  data: UpdateEventTypeInput,
  teamContext: TeamContext | null = null,
) {
  // Gate first: returns the slim row so we know the owner's identity for
  // downstream scoping (slug pool + schedule pool both belong to the
  // current owner, not the actor, when an admin edits a teammate's row).
  const existing = await assertEventTypeAccess(
    userId,
    id,
    teamContext,
    "mutate",
  );

  // MEMBER cannot change meetingLink (would let them rewire a team-branded
  // event type to a phishing URL).
  assertMemberMeetingLinkAllowed(teamContext, data.meetingLink);

  // Schedule pool gate scoped to the row owner (admin editing teammate's
  // event type uses teammate's pool, not their own).
  if (data.availabilityScheduleId) {
    await assertAvailabilityScheduleOwned(
      existing.userId,
      data.availabilityScheduleId,
    );
  }

  try {
    const eventType = await prisma.eventType.update({
      // DB-layer guard: include teamId in the where clause so a stale
      // post-gate context cannot land an update on a row that has since
      // been reassigned (TOCTOU defence — security review must-fix).
      where: { id, teamId: teamContext?.teamId ?? null },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.duration !== undefined && { duration: data.duration }),
        ...(data.locationType !== undefined && {
          locationType: data.locationType,
        }),
        ...(data.meetingLink !== undefined && {
          meetingLink: data.meetingLink,
        }),
        ...(data.bufferBefore !== undefined && {
          bufferBefore: data.bufferBefore,
        }),
        ...(data.bufferAfter !== undefined && {
          bufferAfter: data.bufferAfter,
        }),
        ...(data.minNoticeHours !== undefined && {
          minNoticeHours: data.minNoticeHours,
        }),
        ...(data.maxPerDay !== undefined && { maxPerDay: data.maxPerDay }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.availabilityScheduleId !== undefined && {
          availabilityScheduleId: data.availabilityScheduleId,
        }),
      },
      select: EVENT_TYPE_SELECT,
    });

    logger.info("Event type updated", {
      eventTypeId: id,
      actorId: userId,
      ownerId: existing.userId,
      teamId: teamContext?.teamId ?? null,
    });
    return eventType;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025 — row missing under the combined `{id, teamId}` filter (TOCTOU
      // race or stale context). Collapse to the same 404 as the gate so the
      // shape stays uniform.
      if (err.code === "P2025") {
        throw new AppError(NOT_FOUND_MESSAGE, 404);
      }
      if (err.code === "P2002") {
        throw new AppError("An event type with this slug already exists", 409);
      }
    }
    throw err;
  }
}

export async function deleteEventType(
  userId: string,
  id: string,
  teamContext: TeamContext | null = null,
) {
  const existing = await assertEventTypeAccess(
    userId,
    id,
    teamContext,
    "mutate",
  );

  // Block deletion if there are upcoming confirmed bookings. Scoped by
  // eventTypeId only — bookings belong to the event type regardless of
  // which admin triggered the delete.
  const futureBookings = await prisma.booking.count({
    where: {
      eventTypeId: id,
      isDeleted: false,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { gt: new Date() },
    },
  });

  if (futureBookings > 0) {
    throw new AppError(
      "Cannot delete an event type with upcoming confirmed bookings",
      409,
    );
  }

  // DB-layer guard same as updateEventType — defends against TOCTOU on the
  // delete path.
  await prisma.eventType.updateMany({
    where: { id, teamId: teamContext?.teamId ?? null, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Event type deleted", {
    eventTypeId: id,
    actorId: userId,
    ownerId: existing.userId,
    teamId: teamContext?.teamId ?? null,
  });
}
