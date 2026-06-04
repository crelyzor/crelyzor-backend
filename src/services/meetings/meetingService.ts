import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import { MeetingStatus, MeetingType, Prisma, TeamRole } from "@prisma/client";
import {
  createGCalEventForMeeting,
  updateGCalEventForMeeting,
  deleteCalendarEvent,
} from "../googleCalendarService";
import { cancelBot } from "../recall/recallService";
import ICAL from "ical.js";
import { getRecallBotQueue, JobNames } from "../../config/queue";
import { env } from "../../config/environment";
import { logger } from "../../utils/logging/logger";
import { isVideoMeetingUrl } from "../../utils/isVideoMeetingUrl";
import {
  encrypt,
  blindIndex,
  prismaBytes,
  type Principal,
} from "../../utils/security/crypto";
import type { TeamContext } from "../../middleware/authMiddleware";

// ── Phase 6 P5.1.a team-scoping helpers ──────────────────────────────────────

const NOT_FOUND_MESSAGE = "Meeting not found";

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

/**
 * Returns the Prisma where-clause fragment that scopes a meeting query to the
 * caller's current context. All `meetingService` read paths must spread this
 * into their `where` so a raw `where: { id }` never leaks cross-team data.
 *
 * - Personal context (teamContext null): meeting must be personal (`teamId IS NULL`)
 *   AND the actor must be the creator OR a participant — mirrors the
 *   pre-Phase-6 personal visibility behaviour.
 * - Team context (any role): `teamId = ctx.teamId` — all team members can read
 *   all meetings in the team. Mutation access is enforced separately by
 *   verifyMeetingAccess (MEMBER can only mutate meetings they created).
 *
 * VOICE_NOTE queries must pass `null` as teamContext regardless of the caller's
 * active team — voice notes are always personal and never team-scoped.
 *
 * Soft-delete is NOT part of the scope — caller must add `isDeleted: false`
 * explicitly so writes that need to inspect deleted rows still compose
 * correctly.
 */
function meetingScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.MeetingWhereInput {
  if (!teamContext) {
    return {
      teamId: null,
      OR: [
        { createdById: actorId },
        { participants: { some: { userId: actorId } } },
      ],
    };
  }
  return { teamId: teamContext.teamId };
}

type MeetingForAccess = {
  teamId: string | null;
  createdById: string;
  isDeleted: boolean;
  participants?: Array<{ userId: string | null }>;
};

/**
 * Derives the encrypt/decrypt principal for content scoped to a meeting.
 * **Always read from the meeting row, never from the actor.** A team admin
 * editing a team-scoped meeting must re-encrypt under the team DEK so other
 * admins can read the result.
 */
export function principalForMeeting(meeting: {
  teamId: string | null;
  createdById: string;
}): Principal {
  return meeting.teamId
    ? { type: "team", id: meeting.teamId }
    : { type: "user", id: meeting.createdById };
}

/**
 * Centralized access gate for all CRUD on a meeting. Throws 404 with a
 * uniform body for every "not accessible" branch (wrong team, soft-deleted,
 * non-participant member, missing) — same enumeration-collapse pattern as
 * P1/P2.
 *
 * `action`:
 * - `"read"` — read-only access. MEMBER may see meetings they created or
 *   are a participant in.
 * - `"mutate"` — write access. Under team context, MEMBER can mutate only
 *   meetings they created (creator-only rule per spec).
 */
export function verifyMeetingAccess(
  actorId: string,
  meeting: MeetingForAccess,
  teamContext: TeamContext | null,
  action: "read" | "mutate",
): void {
  if (meeting.isDeleted) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }

  const isCreator = meeting.createdById === actorId;
  const isParticipant = meeting.participants?.some((p) => p.userId === actorId);

  if (!teamContext) {
    // Personal context: meeting must be personal.
    if (meeting.teamId !== null) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    if (action === "mutate") {
      // Mutations on a personal meeting are creator-only — matches the
      // pre-Phase-6 ownership convention.
      if (!isCreator) throw new AppError(NOT_FOUND_MESSAGE, 404);
      return;
    }
    // Read: creator OR participant.
    if (!isCreator && !isParticipant) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    return;
  }

  // Team context: meeting must belong to the same team.
  if (meeting.teamId !== teamContext.teamId) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }

  if (teamContext.role === TeamRole.MEMBER && action === "mutate") {
    // Hard rule: MEMBER can mutate only meetings they created. Being a
    // participant does NOT grant edit rights — a MEMBER invited to an
    // ADMIN's meeting must not be able to mutate it.
    if (!isCreator) throw new AppError(NOT_FOUND_MESSAGE, 404);
    return;
  }
  // MEMBER read + ADMIN/OWNER any action: any meeting in the team is accessible.
  void ROLE_RANK; // keep referenced for symmetry; comparisons happen elsewhere
}

/**
 * One-shot meeting access gate for nested services (attachments, notes,
 * share, tags, etc.). Slim-fetches the meeting, runs verifyMeetingAccess,
 * and returns the row so callers can use `principalForMeeting(meeting)` for
 * encrypt/decrypt of meeting-scoped content.
 *
 * Throws `AppError 404 "Meeting not found"` on every "not accessible" branch
 * — uniform body matches the rest of the meeting CRUD surface.
 */
export type AssertedMeeting = {
  id: string;
  teamId: string | null;
  createdById: string;
  isDeleted: boolean;
  participants: Array<{ userId: string | null }>;
};

export async function assertMeetingAccess(
  actorId: string,
  meetingId: string,
  teamContext: TeamContext | null,
  action: "read" | "mutate",
): Promise<AssertedMeeting> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      teamId: true,
      createdById: true,
      isDeleted: true,
      participants: { select: { userId: true } },
    },
  });
  if (!meeting) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }
  verifyMeetingAccess(actorId, meeting, teamContext, action);
  return meeting;
}

const meetingInclude = {
  team: {
    select: { id: true, name: true, slug: true },
  },
  participants: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
      card: {
        select: {
          id: true,
          displayName: true,
          slug: true,
        },
      },
    },
  },
  tags: {
    include: {
      tag: {
        select: { id: true, name: true, color: true },
      },
    },
  },
  booking: {
    select: { id: true, status: true },
  },
} satisfies Prisma.MeetingInclude;

type MeetingWithDetails = Prisma.MeetingGetPayload<{
  include: typeof meetingInclude;
}>;

// Lighter include for list endpoints — uses _count instead of full participant objects.
// `teamId` is a scalar so it's already in the payload; `team` join provides the badge
// data the frontend needs without an extra fetch.
const meetingListInclude = {
  _count: {
    select: { participants: true },
  },
  team: {
    select: { id: true, name: true, slug: true },
  },
  participants: {
    select: { userId: true },
  },
  tags: {
    include: {
      tag: {
        select: { id: true, name: true, color: true },
      },
    },
  },
  booking: {
    select: { id: true, status: true },
  },
  createdBy: {
    select: { id: true, name: true, avatarUrl: true },
  },
} satisfies Prisma.MeetingInclude;

type MeetingListItem = Prisma.MeetingGetPayload<{
  include: typeof meetingListInclude;
}>;

interface ConflictResult {
  type: "MEETING";
  startTime: Date;
  endTime: Date;
  details: string;
}

export interface CreateMeetingDTO {
  createdById: string;
  title?: string;
  description?: string;
  type?: MeetingType;
  startTime?: Date;
  endTime?: Date;
  timezone: string;
  location?: string;
  participantUserIds?: string[];
  guestEmails?: string[];
  notes?: string;
  addToCalendar?: boolean;
}

export interface UpdateMeetingStatusDTO {
  meetingId: string;
  newStatus: MeetingStatus;
  requesterUserId: string;
  reason?: string;
}

export interface ConflictDetectionParams {
  userId: string;
  startTime: Date;
  endTime: Date;
  excludeMeetingId?: string;
}

export const meetingService = {
  async createMeeting(
    data: CreateMeetingDTO,
    teamContext: TeamContext | null = null,
  ): Promise<{ meeting: MeetingWithDetails; gcalSynced: boolean }> {
    const {
      createdById,
      description,
      type = MeetingType.SCHEDULED,
      timezone,
      location,
      participantUserIds,
      guestEmails,
      notes,
    } = data;

    // Under team context, MEMBER role is restricted to inviting active
    // teammates as participants — prevents using a team meeting to leak
    // visibility to outsiders.
    if (
      teamContext &&
      teamContext.role === TeamRole.MEMBER &&
      participantUserIds &&
      participantUserIds.length > 0
    ) {
      const teamMemberCount = await prisma.teamMember.count({
        where: {
          teamId: teamContext.teamId,
          userId: { in: participantUserIds },
          isDeleted: false,
        },
      });
      if (teamMemberCount !== participantUserIds.length) {
        throw new AppError(
          "Members can only invite teammates as participants",
          403,
        );
      }
    }

    const normalizedGuestEmails = [
      ...new Set((guestEmails ?? []).map((email) => email.toLowerCase())),
    ];

    const isScheduled = type === MeetingType.SCHEDULED;

    // Auto-populate title for non-scheduled types (AI will rename after transcription)
    const title = data.title || (isScheduled ? "" : "New Recording");

    // Auto-populate times for non-scheduled types
    const now = new Date();
    const startTime = data.startTime ?? now;
    const endTime = data.endTime ?? new Date(now.getTime() + 60 * 60 * 1000);

    if (isScheduled && startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Participants only relevant for scheduled meetings
    if (isScheduled) {
      if (participantUserIds && participantUserIds.includes(createdById)) {
        throw ErrorFactory.validation(
          "Meeting creator cannot be included in the participants list.",
        );
      }

      if (participantUserIds && participantUserIds.length > 0) {
        const participants = await prisma.user.findMany({
          where: { id: { in: participantUserIds }, isActive: true },
        });

        if (participants.length !== participantUserIds.length) {
          throw ErrorFactory.notFound(
            "Some participants not found or inactive",
          );
        }
      }

      const conflicts = await this.detectConflicts({
        userId: createdById,
        startTime,
        endTime,
      });
      if (conflicts.length > 0) {
        throw ErrorFactory.conflict(
          `You have conflicting meetings at this time: ${conflicts.map((c) => c.details).join(", ")}`,
        );
      }
    }

    const meeting = await prisma.$transaction(
      async (tx) => {
        const newMeeting = await tx.meeting.create({
          data: {
            title,
            description,
            type,
            startTime,
            endTime,
            timezone,
            status: MeetingStatus.CREATED,
            location,
            notes,
            createdById,
            // Phase 6 P5.1.a — write teamId from caller's context so the
            // meeting is bound to the team for all subsequent reads.
            // VOICE_NOTE is always personal regardless of team context.
            teamId: type === MeetingType.VOICE_NOTE ? null : (teamContext?.teamId ?? null),
          },
        });
        // Encryption principal is derived from the meeting row, never from
        // the actor — see principalForMeeting JSDoc.
        const meetingPrincipal = principalForMeeting(newMeeting);

        // Participants only for scheduled meetings
        if (isScheduled) {
          await tx.meetingParticipant.create({
            data: {
              meetingId: newMeeting.id,
              userId: createdById,
              participantType: "ORGANIZER",
            },
          });

          if (participantUserIds && participantUserIds.length > 0) {
            const participantUsers = await tx.user.findMany({
              where: { id: { in: participantUserIds } },
              select: { id: true, email: true },
            });

            // Auto-link registered participants to CardContacts using blind indexes
            // (CardContact.email is encrypted — ILIKE/in on plaintext won't work)
            const emailBidxMap = new Map(
              participantUsers
                .filter((u): u is typeof u & { email: string } => !!u.email)
                .map((u) => [u.id, blindIndex(u.email)]),
            );
            const bidxBuffers = Array.from(emailBidxMap.values()).map(
              prismaBytes,
            );

            const matchedContacts =
              bidxBuffers.length > 0
                ? await tx.cardContact.findMany({
                    where: {
                      card: { userId: createdById },
                      emailBidx: { in: bidxBuffers },
                    },
                    select: { emailBidx: true, cardId: true },
                  })
                : [];

            const bidxHexToCardId = new Map(
              matchedContacts
                .filter(
                  (c): c is typeof c & { emailBidx: Buffer } => !!c.emailBidx,
                )
                .map((c) => [
                  Buffer.from(c.emailBidx).toString("hex"),
                  c.cardId,
                ]),
            );

            await tx.meetingParticipant.createMany({
              data: participantUsers.map((u) => {
                const bidx = emailBidxMap.get(u.id);
                const cardId = bidx
                  ? (bidxHexToCardId.get(Buffer.from(bidx).toString("hex")) ??
                    null)
                  : null;
                return {
                  meetingId: newMeeting.id,
                  userId: u.id,
                  participantType: "ATTENDEE" as const,
                  cardId,
                };
              }),
            });
          }

          // Add guest participants (external emails) — encrypt before storing.
          // Principal comes from the meeting row (team DEK if team-scoped,
          // user DEK otherwise) so reads under team context decrypt cleanly.
          if (normalizedGuestEmails.length > 0) {
            const encryptedGuests = await Promise.all(
              normalizedGuestEmails.map(async (email) => ({
                meetingId: newMeeting.id,
                guestEmail: await encrypt(email, meetingPrincipal),
                guestEmailBidx: prismaBytes(blindIndex(email)),
                participantType: "ATTENDEE" as const,
              })),
            );
            await tx.meetingParticipant.createMany({ data: encryptedGuests });
          }
        }

        return tx.meeting.findUnique({
          where: { id: newMeeting.id },
          include: meetingInclude,
        });
      },
      { timeout: 15000 },
    );

    if (!meeting) {
      throw ErrorFactory.validation("Failed to create meeting");
    }

    // The transaction already returns the fully-populated meeting via meetingInclude.
    // No second round-trip needed.
    let committedMeeting = meeting;

    const attendeeEmails = committedMeeting.participants.reduce<
      Array<{ email: string; displayName?: string }>
    >((acc, participant) => {
      if (participant.userId === createdById) return acc;
      if (!participant.user?.email) return acc;
      acc.push({
        email: participant.user.email,
        ...(participant.user.name
          ? { displayName: participant.user.name }
          : {}),
      });
      return acc;
    }, []);

    const attendeeSet = new Set(
      attendeeEmails.map((attendee) => attendee.email.toLowerCase()),
    );
    for (const guestEmail of normalizedGuestEmails) {
      if (attendeeSet.has(guestEmail)) continue;
      attendeeEmails.push({ email: guestEmail });
      attendeeSet.add(guestEmail);
    }

    // Create Google Calendar event for SCHEDULED meetings when requested.
    // Includes conference data to generate a Meet URL in a single API call.
    // Fail-open: GCal failure never prevents the meeting from being created.
    let gcalSynced = false;
    if (isScheduled && data.addToCalendar !== false) {
      try {
        const gcalResult = await createGCalEventForMeeting(createdById, {
          title: committedMeeting.title,
          startTime: committedMeeting.startTime,
          endTime: committedMeeting.endTime,
          timezone: committedMeeting.timezone,
          location: committedMeeting.location,
          description: committedMeeting.description,
          attendees: attendeeEmails,
          requestMeetLink: true,
        });
        if (gcalResult) {
          const updatedMeeting = await prisma.meeting.update({
            where: { id: committedMeeting.id },
            data: {
              googleEventId: gcalResult.googleEventId,
              ...(gcalResult.meetLink ? { meetLink: gcalResult.meetLink } : {}),
            },
            include: meetingInclude,
          });
          committedMeeting = updatedMeeting;
          gcalSynced = true;
        }
      } catch (err) {
        logger.warn("GCal sync failed during meeting create — fail-open", {
          meetingId: committedMeeting.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Recall bot — queue deploy for SCHEDULED meetings with a video link.
    // Fail-open: bot deploy failure never blocks meeting creation.
    if (isScheduled && env.RECALL_API_KEY) {
      const videoLink = committedMeeting.meetLink ?? committedMeeting.location;
      if (videoLink && isVideoMeetingUrl(videoLink)) {
        try {
          const settings = await prisma.userSettings.findUnique({
            where: { userId: createdById },
            select: { recallEnabled: true },
          });

          if (settings?.recallEnabled) {
            const deployAt =
              committedMeeting.startTime.getTime() - 5 * 60 * 1000;
            const delay = Math.max(0, deployAt - Date.now());

            await getRecallBotQueue().add(
              JobNames.DEPLOY_RECALL_BOT,
              {
                meetingId: committedMeeting.id,
                hostUserId: createdById,
                // Phase 6 P5.1.a — carry teamId so the worker can resolve
                // the billing principal via getQuotaOwner. Workers do NOT
                // consume this yet (P5.1.c wires checkRecall/deductRecall
                // to honour it); for now the bot deploys against
                // hostUserId quota and the team owner isn't billed.
                ...(committedMeeting.teamId
                  ? { teamId: committedMeeting.teamId }
                  : {}),
              },
              { delay, jobId: `recall-bot-${committedMeeting.id}` },
            );
            logger.info("Recall bot deployment queued for manual meeting", {
              meetingId: committedMeeting.id,
              delayMs: delay,
              teamId: committedMeeting.teamId ?? null,
              // TODO(P5.1.c): switch billedTo to getQuotaOwner({userId:
              // hostUserId, teamId}) so this reflects the actual payer.
              billedTo: createdById,
            });
          }
        } catch (err) {
          logger.warn(
            "Recall bot queue failed during meeting create — fail-open",
            {
              meetingId: committedMeeting.id,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }
    }

    return { meeting: committedMeeting, gcalSynced };
  },

  async updateMeeting(
    meetingId: string,
    updatedByUserId: string,
    data: {
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      timezone?: string;
      location?: string;
      participantUserIds?: string[];
      notes?: string;
      addToCalendar?: boolean;
    },
    teamContext: TeamContext | null = null,
  ): Promise<MeetingWithDetails> {
    // Resolve identity-only first so verifyMeetingAccess can branch on it
    // before we run any further scoped reads.
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        timezone: true,
        createdById: true,
        teamId: true,
        isDeleted: true,
        googleEventId: true,
        recallBotId: true,
        participants: { select: { userId: true, participantType: true } },
      },
    });

    if (!meeting) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    verifyMeetingAccess(updatedByUserId, meeting, teamContext, "mutate");

    // Under team context, MEMBER role can only invite teammates as
    // participants — same guard as createMeeting.
    if (
      teamContext &&
      teamContext.role === TeamRole.MEMBER &&
      data.participantUserIds &&
      data.participantUserIds.length > 0
    ) {
      const teamMemberCount = await prisma.teamMember.count({
        where: {
          teamId: teamContext.teamId,
          userId: { in: data.participantUserIds },
          isDeleted: false,
        },
      });
      if (teamMemberCount !== data.participantUserIds.length) {
        throw new AppError(
          "Members can only invite teammates as participants",
          403,
        );
      }
    }

    if (["COMPLETED", "CANCELLED"].includes(meeting.status)) {
      throw ErrorFactory.conflict(
        "Cannot update a completed or cancelled meeting",
      );
    }

    const newStartTime = data.startTime || meeting.startTime;
    const newEndTime = data.endTime || meeting.endTime;

    if (data.startTime || data.endTime) {
      const conflicts = await this.detectConflicts({
        userId: meeting.createdById,
        startTime: newStartTime,
        endTime: newEndTime,
        excludeMeetingId: meetingId,
      });

      if (conflicts.length > 0) {
        throw ErrorFactory.conflict(
          `Meeting time is not available: ${conflicts.map((c) => c.details).join(", ")}`,
        );
      }

      const otherParticipants = meeting.participants.filter(
        (p) => p.userId !== meeting.createdById && p.userId !== null,
      );
      const participantConflictResults = await Promise.all(
        otherParticipants.map((p) =>
          this.detectConflicts({
            userId: p.userId!,
            startTime: newStartTime,
            endTime: newEndTime,
            excludeMeetingId: meetingId,
          }),
        ),
      );
      if (participantConflictResults.some((r) => r.length > 0)) {
        throw ErrorFactory.conflict(
          "One or more participants has conflicts at the new time",
        );
      }
    }

    if (data.participantUserIds) {
      if (data.participantUserIds.includes(meeting.createdById)) {
        throw ErrorFactory.validation(
          "Meeting creator cannot be in the participants list.",
        );
      }

      const newParticipants = await prisma.user.findMany({
        where: { id: { in: data.participantUserIds }, isActive: true },
      });

      if (newParticipants.length !== data.participantUserIds.length) {
        throw ErrorFactory.notFound("Some participants not found or inactive");
      }
    }

    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        await tx.meeting.update({
          where: { id: meetingId },
          data: {
            ...(data.title && { title: data.title }),
            ...(data.description !== undefined && {
              description: data.description,
            }),
            ...(data.startTime && { startTime: data.startTime }),
            ...(data.endTime && { endTime: data.endTime }),
            ...(data.timezone && { timezone: data.timezone }),
            ...(data.location !== undefined && { location: data.location }),
            ...(data.notes !== undefined && { notes: data.notes }),
          },
        });

        if (data.participantUserIds) {
          const currentParticipantIds = meeting.participants
            .filter(
              (p) => p.userId !== meeting.createdById && p.userId !== null,
            )
            .map((p) => p.userId!);

          const toRemove = currentParticipantIds.filter(
            (id) => !data.participantUserIds!.includes(id),
          );
          const toAdd = data.participantUserIds.filter(
            (id) => !currentParticipantIds.includes(id),
          );

          if (toRemove.length > 0) {
            await tx.meetingParticipant.deleteMany({
              where: { meetingId, userId: { in: toRemove } },
            });
          }

          if (toAdd.length > 0) {
            const addedUsers = await tx.user.findMany({
              where: { id: { in: toAdd } },
              select: { id: true, email: true },
            });

            // Auto-link using blind indexes (CardContact.email is encrypted)
            const emailBidxMap = new Map(
              addedUsers
                .filter((u): u is typeof u & { email: string } => !!u.email)
                .map((u) => [u.id, blindIndex(u.email)]),
            );
            const bidxBuffers = Array.from(emailBidxMap.values()).map(
              prismaBytes,
            );

            const matchedContacts =
              bidxBuffers.length > 0
                ? await tx.cardContact.findMany({
                    where: {
                      card: { userId: updatedByUserId },
                      emailBidx: { in: bidxBuffers },
                    },
                    select: { emailBidx: true, cardId: true },
                  })
                : [];

            const bidxHexToCardId = new Map(
              matchedContacts
                .filter(
                  (c): c is typeof c & { emailBidx: Buffer } => !!c.emailBidx,
                )
                .map((c) => [
                  Buffer.from(c.emailBidx).toString("hex"),
                  c.cardId,
                ]),
            );

            await tx.meetingParticipant.createMany({
              data: addedUsers.map((u) => {
                const bidx = emailBidxMap.get(u.id);
                const cardId = bidx
                  ? (bidxHexToCardId.get(Buffer.from(bidx).toString("hex")) ??
                    null)
                  : null;
                return {
                  meetingId,
                  userId: u.id,
                  participantType: "ATTENDEE" as const,
                  cardId,
                };
              }),
            });
          }
        }

        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: meeting.status,
            toStatus: meeting.status,
            changedById: updatedByUserId,
            reason: "Meeting details updated",
          },
        });

        return tx.meeting.findUnique({
          where: { id: meetingId },
          include: meetingInclude,
        });
      },
      { timeout: 15000 },
    );

    if (!updatedMeeting) {
      throw ErrorFactory.validation("Failed to update meeting");
    }

    // Sync changes to Google Calendar if this meeting has a linked GCal event.
    // Fail-open: GCal failure never blocks the meeting update response.
    if (meeting.googleEventId) {
      await updateGCalEventForMeeting(updatedByUserId, meeting.googleEventId, {
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        timezone: data.timezone ?? meeting.timezone,
        location: data.location,
        description: data.description,
      });
    } else if (
      meeting.status === MeetingStatus.CREATED &&
      data.addToCalendar !== false
    ) {
      try {
        const gcalResult = await createGCalEventForMeeting(updatedByUserId, {
          title: updatedMeeting.title,
          startTime: newStartTime,
          endTime: newEndTime,
          timezone: data.timezone ?? meeting.timezone,
          location: data.location,
          description: data.description,
          requestMeetLink: true,
        });

        if (gcalResult) {
          await prisma.meeting.update({
            where: { id: meetingId },
            data: {
              googleEventId: gcalResult.googleEventId,
              ...(gcalResult.meetLink ? { meetLink: gcalResult.meetLink } : {}),
            },
          });
        }
      } catch (err) {
        logger.warn("GCal update failed after meeting update — fail-open", {
          meetingId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Recall bot rescheduling for edited meetings.
    // If start time or meeting link changes, clear old queue/bot and queue fresh deploy.
    const shouldRescheduleRecall =
      data.startTime !== undefined || data.location !== undefined;

    if (
      meeting.status === MeetingStatus.CREATED &&
      env.RECALL_API_KEY &&
      shouldRescheduleRecall
    ) {
      try {
        await removeExistingRecallDeployJobs(updatedMeeting.id);

        const latestMeeting = await prisma.meeting.findUnique({
          where: { id: updatedMeeting.id },
          select: {
            id: true,
            startTime: true,
            meetLink: true,
            location: true,
            recallBotId: true,
            teamId: true,
          },
        });

        if (!latestMeeting) {
          return updatedMeeting;
        }

        if (latestMeeting.recallBotId) {
          try {
            await cancelBot(latestMeeting.recallBotId);
          } catch (err) {
            logger.warn(
              "Failed to cancel existing Recall bot during meeting edit",
              {
                meetingId: latestMeeting.id,
                botId: latestMeeting.recallBotId,
                error: err instanceof Error ? err.message : String(err),
              },
            );
          }

          await prisma.meeting.update({
            where: { id: latestMeeting.id },
            data: { recallBotId: null },
          });
        }

        const settings = await prisma.userSettings.findUnique({
          where: { userId: updatedByUserId },
          select: { recallEnabled: true },
        });

        const videoLink = latestMeeting.meetLink ?? latestMeeting.location;
        if (
          settings?.recallEnabled &&
          videoLink &&
          isVideoMeetingUrl(videoLink)
        ) {
          const deployAt = latestMeeting.startTime.getTime() - 5 * 60 * 1000;
          const delay = Math.max(0, deployAt - Date.now());

          await getRecallBotQueue().add(
            JobNames.DEPLOY_RECALL_BOT,
            {
              meetingId: latestMeeting.id,
              hostUserId: updatedByUserId,
              // Phase 6 P5.1.a — see createMeeting for the consumption
              // contract. Worker honours teamId only after P5.1.c lands.
              ...(latestMeeting.teamId ? { teamId: latestMeeting.teamId } : {}),
            },
            { delay, jobId: `recall-bot-${latestMeeting.id}-${Date.now()}` },
          );
          logger.info("Recall bot deployment re-queued for edited meeting", {
            meetingId: latestMeeting.id,
            delayMs: delay,
            teamId: latestMeeting.teamId ?? null,
            billedTo: updatedByUserId, // TODO(P5.1.c): getQuotaOwner
          });
        }
      } catch (err) {
        logger.warn(
          "Recall bot reschedule on meeting edit failed (fail-open)",
          {
            meetingId: updatedMeeting.id,
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    }

    return updatedMeeting;
  },

  async cancelMeeting(
    data: UpdateMeetingStatusDTO,
    teamContext: TeamContext | null = null,
  ): Promise<MeetingWithDetails> {
    const { meetingId, requesterUserId, reason } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        status: true,
        googleEventId: true,
        createdById: true,
        teamId: true,
        isDeleted: true,
        participants: { select: { userId: true } },
        booking: { select: { id: true } },
      },
    });

    if (!meeting) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    verifyMeetingAccess(requesterUserId, meeting, teamContext, "mutate");

    const cancelled = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.meeting.update({
          where: { id: meetingId },
          data: {
            status: MeetingStatus.CANCELLED,
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: requesterUserId,
          },
          include: meetingInclude,
        });

        if (meeting.booking?.id) {
          await tx.booking.update({
            where: { id: meeting.booking.id },
            data: {
              status: "CANCELLED",
              cancelReason: reason || "Meeting cancelled",
              canceledAt: new Date(),
            },
          });
        }

        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: meeting.status,
            toStatus: MeetingStatus.CANCELLED,
            changedById: requesterUserId,
            reason: reason || "Meeting cancelled",
          },
        });

        return updated;
      },
      { timeout: 15000 },
    );

    // Remove from Google Calendar after DB is committed. Fail-open.
    await deleteCalendarEvent(requesterUserId, meeting.googleEventId);

    return cancelled;
  },

  async completeMeeting(
    data: UpdateMeetingStatusDTO,
    teamContext: TeamContext | null = null,
  ): Promise<MeetingWithDetails> {
    const { meetingId, requesterUserId } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        status: true,
        createdById: true,
        teamId: true,
        isDeleted: true,
        participants: {
          select: { userId: true, participantType: true },
        },
      },
    });

    if (!meeting) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    verifyMeetingAccess(requesterUserId, meeting, teamContext, "mutate");

    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be marked as completed",
      );
    }

    return prisma.$transaction(
      async (tx) => {
        const updated = await tx.meeting.update({
          where: { id: meetingId },
          data: { status: MeetingStatus.COMPLETED },
          include: meetingInclude,
        });

        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: MeetingStatus.CREATED,
            toStatus: MeetingStatus.COMPLETED,
            changedById: requesterUserId,
            reason: "Meeting completed",
          },
        });

        return updated;
      },
      { timeout: 15000 },
    );
  },

  async getMeetings(params: {
    userId: string;
    status?: MeetingStatus;
    type?: MeetingType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    teamContext?: TeamContext | null;
  }): Promise<{
    meetings: MeetingListItem[];
    total: number;
  }> {
    const {
      userId,
      status,
      type,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
      teamContext = null,
    } = params;

    // Voice notes are always personal — ignore team context so they remain
    // visible regardless of which workspace is active.
    const effectiveContext = type === MeetingType.VOICE_NOTE ? null : teamContext;
    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      ...meetingScope(userId, effectiveContext),
    };

    if (status) where.status = status;
    if (type) where.type = type;

    if (startDate || endDate) {
      where.startTime = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        include: meetingListInclude,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.meeting.count({ where }),
    ]);

    return { meetings, total };
  },

  async getMeetingsWithoutPagination(params: {
    userId: string;
    status?: MeetingStatus;
    type?: MeetingType;
    startDate?: Date;
    endDate?: Date;
    teamContext?: TeamContext | null;
  }): Promise<{
    meetings: MeetingListItem[];
    truncated: boolean;
  }> {
    const {
      userId,
      status,
      type,
      startDate,
      endDate,
      teamContext = null,
    } = params;

    // Voice notes are always personal — ignore team context so they remain
    // visible regardless of which workspace is active.
    const effectiveContext = type === MeetingType.VOICE_NOTE ? null : teamContext;
    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      ...meetingScope(userId, effectiveContext),
    };

    if (status) where.status = status;
    if (type) where.type = type;

    if (startDate || endDate) {
      where.startTime = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    // Default to last 90 days if no date window is provided
    if (!startDate && !endDate) {
      where.startTime = {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      };
    }

    const MAX_CALENDAR_MEETINGS = 200;
    const rows = await prisma.meeting.findMany({
      where,
      include: meetingListInclude,
      orderBy: { createdAt: "desc" },
      take: MAX_CALENDAR_MEETINGS + 1,
    });

    const truncated = rows.length > MAX_CALENDAR_MEETINGS;
    return {
      meetings: truncated ? rows.slice(0, MAX_CALENDAR_MEETINGS) : rows,
      truncated,
    };
  },

  async detectConflicts(
    params: ConflictDetectionParams,
  ): Promise<ConflictResult[]> {
    const { userId, startTime, endTime, excludeMeetingId } = params;

    const CONFLICT_DETECTION_LIMIT = 20;
    const meetings = await prisma.meeting.findMany({
      where: {
        isDeleted: false,
        id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
        status: { in: [MeetingStatus.CREATED] },
        OR: [{ createdById: userId }, { participants: { some: { userId } } }],
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      take: CONFLICT_DETECTION_LIMIT,
    });

    return meetings.map((meeting) => ({
      type: "MEETING",
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      details: `Meeting "${meeting.title}" at ${meeting.startTime.toLocaleTimeString()} - ${meeting.endTime.toLocaleTimeString()}`,
    }));
  },

  async deleteMeeting(
    meetingId: string,
    userId: string,
    teamContext: TeamContext | null = null,
  ): Promise<void> {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        googleEventId: true,
        createdById: true,
        teamId: true,
        isDeleted: true,
        participants: { select: { userId: true } },
      },
    });

    if (!meeting) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    verifyMeetingAccess(userId, meeting, teamContext, "mutate");

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });

    // Remove from Google Calendar after DB is committed. Fail-open.
    await deleteCalendarEvent(userId, meeting.googleEventId);
  },

  async importMeetingsFromIcs(
    userId: string,
    fileBuffer: Buffer,
    teamContext: TeamContext | null = null,
  ) {
    // Phase 6 P5.1.a — ICS import always creates personal meetings for now.
    // Team-scoped bulk import has different access/visibility semantics
    // (which member sees the imported events, who pays for transcription
    // when the user re-imports historical data, etc.) and is deferred to
    // P5.1.b where we can spec it properly.
    if (teamContext) {
      throw new AppError(
        "ICS import is not yet available in team context",
        400,
      );
    }
    const raw = fileBuffer.toString("utf-8");

    let events: ICAL.Component[] = [];
    try {
      const parsed = ICAL.parse(raw);
      const root = new ICAL.Component(parsed);
      events = root.getAllSubcomponents("vevent");
    } catch {
      throw ErrorFactory.validation("Invalid ICS file");
    }

    if (events.length === 0) {
      throw ErrorFactory.validation("No calendar events found in ICS file");
    }

    // Pre-batch dedup: collect all UIDs, find existing in one query
    const allUids = events
      .map((c) => new ICAL.Event(c).uid?.trim())
      .filter((uid): uid is string => !!uid);

    const existingMeetings =
      allUids.length > 0
        ? await prisma.meeting.findMany({
            where: {
              createdById: userId,
              googleEventId: { in: allUids },
              isDeleted: false,
            },
            select: { googleEventId: true },
          })
        : [];
    const existingUids = new Set(
      existingMeetings.map((m) => m.googleEventId).filter(Boolean) as string[],
    );

    let created = 0;
    let skipped = existingMeetings.length;
    const errors: string[] = [];

    // Parse and validate all events first, collecting per-event errors
    type ValidEvent = {
      uid?: string;
      title: string;
      description?: string;
      location?: string;
      timezone: string;
      startTime: Date;
      endTime: Date;
    };
    const toCreate: ValidEvent[] = [];

    for (const component of events) {
      try {
        const event = new ICAL.Event(component);
        const uid = event.uid?.trim();

        // Skip already-existing UIDs — covers both DB duplicates and within-file duplicates
        if (uid && existingUids.has(uid)) {
          skipped += 1;
          continue;
        }

        const startTime = event.startDate?.toJSDate();

        if (!startTime) {
          skipped += 1;
          errors.push("Skipped event with missing start time");
          continue;
        }

        const parsedEnd = event.endDate?.toJSDate();
        const endTime =
          parsedEnd && parsedEnd > startTime
            ? parsedEnd
            : new Date(startTime.getTime() + 30 * 60 * 1000);

        toCreate.push({
          uid: uid || undefined,
          title: event.summary?.trim() || "Imported meeting",
          description: event.description?.trim() || undefined,
          location: event.location?.trim() || undefined,
          timezone: event.startDate?.zone?.tzid || "UTC",
          startTime,
          endTime,
        });
      } catch (error) {
        skipped += 1;
        const message =
          error instanceof Error ? error.message : "Failed to import event";
        errors.push(message);
      }
    }

    // Batch all valid events into a single transaction
    if (toCreate.length > 0) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const participantRows: Array<{
              meetingId: string;
              userId: string;
              participantType: "ORGANIZER";
            }> = [];

            for (const ev of toCreate) {
              const meeting = await tx.meeting.create({
                data: {
                  title: ev.title,
                  description: ev.description,
                  type: MeetingType.SCHEDULED,
                  startTime: ev.startTime,
                  endTime: ev.endTime,
                  timezone: ev.timezone,
                  status: MeetingStatus.CREATED,
                  location: ev.location,
                  createdById: userId,
                  ...(ev.uid ? { googleEventId: ev.uid } : {}),
                },
              });

              participantRows.push({
                meetingId: meeting.id,
                userId,
                participantType: "ORGANIZER" as const,
              });

              if (ev.uid) existingUids.add(ev.uid);
            }

            // Batch all participant inserts in a single round-trip
            await tx.meetingParticipant.createMany({ data: participantRows });
          },
          { timeout: 30000 },
        );
        created = toCreate.length;
      } catch (error) {
        logger.error("ICS import batch transaction failed", {
          userId,
          eventCount: toCreate.length,
          error: error instanceof Error ? error.message : String(error),
        });
        skipped += toCreate.length;
        errors.push(
          "Batch insert failed: " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    logger.info("ICS import completed", {
      userId,
      created,
      skipped,
      total: events.length,
    });

    return {
      created,
      skipped,
      errors: errors.slice(0, 50),
    };
  },
};

async function removeExistingRecallDeployJobs(
  meetingId: string,
): Promise<void> {
  const queue = getRecallBotQueue();
  // Scan only active states — completed/failed jobs are irrelevant for rescheduling
  // and scanning all states would load the entire job history into memory.
  const jobs = await queue.getJobs(["waiting", "delayed"]);

  const prefix = `recall-bot-${meetingId}`;
  const matchingJobs = jobs.filter((job) => {
    const currentJobId = job.id ? String(job.id) : "";
    return currentJobId.startsWith(prefix);
  });

  await Promise.all(
    matchingJobs.map(async (job) => {
      const currentJobId = job.id ? String(job.id) : "";
      await job.remove();
      logger.info("Removed existing Recall bot deploy job before reschedule", {
        meetingId,
        jobId: currentJobId,
      });
    }),
  );
}
