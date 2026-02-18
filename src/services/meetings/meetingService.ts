import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import {
  Meeting,
  MeetingStatus,
  MeetingParticipant,
  Prisma,
} from "@prisma/client";
import { googleService } from "../googleService";

// Standard include for meeting queries - user-level
const meetingInclude = {
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
    },
  },
  guests: true,
  stateHistory: true,
  eventType: {
    select: { id: true, title: true, slug: true, duration: true },
  },
} satisfies Prisma.MeetingInclude;

export interface CreateMeetingDTO {
  createdById: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  mode: "ONLINE" | "IN_PERSON";
  location?: string;
  participantUserIds?: string[];
  guestEmails?: string[];
  notes?: string;
  eventTypeId?: string;
}

export interface UpdateMeetingStatusDTO {
  meetingId: string;
  newStatus: MeetingStatus;
  requesterUserId: string;
  reason?: string;
}

export interface RescheduleRequestDTO {
  meetingId: string;
  proposedStartTime: Date;
  proposedEndTime: Date;
  requestedByUserId: string;
  reason?: string;
}

export interface RespondToRescheduleDTO {
  rescheduleRequestId: string;
  respondedByUserId: string;
  accepted: boolean;
  responseNotes?: string;
}

export interface ConflictDetectionParams {
  userId: string;
  startTime: Date;
  endTime: Date;
  excludeMeetingId?: string;
}

export const meetingService = {
  /**
   * Create meeting (user-level, no org context)
   */
  async createMeeting(data: CreateMeetingDTO): Promise<Meeting> {
    const {
      createdById,
      title,
      description,
      startTime,
      endTime,
      timezone,
      mode,
      location,
      participantUserIds,
      guestEmails = [],
      notes,
      eventTypeId,
    } = data;

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate creator is not in participant list
    if (participantUserIds && participantUserIds.includes(createdById)) {
      throw ErrorFactory.validation(
        "Meeting creator cannot be included in the participants list. The creator is automatically added as the organizer.",
      );
    }

    // Validate all participants exist and are active
    if (participantUserIds && participantUserIds.length > 0) {
      const participants = await prisma.user.findMany({
        where: {
          id: { in: participantUserIds },
          isActive: true,
        },
      });

      if (participants.length !== participantUserIds.length) {
        throw ErrorFactory.notFound("Some participants not found or inactive");
      }
    }

    // Check for conflicts for the creator
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

    const meeting = await prisma.$transaction(
      async (tx) => {
        const newMeeting = await tx.meeting.create({
          data: {
            title,
            description,
            startTime,
            endTime,
            timezone,
            mode,
            status: MeetingStatus.CREATED,
            location,
            notes,
            createdById,
            eventTypeId,
          },
        });

        // Add participants (they must accept)
        if (participantUserIds && participantUserIds.length > 0) {
          await tx.meetingParticipant.createMany({
            data: participantUserIds.map((userId) => ({
              meetingId: newMeeting.id,
              userId,
              participantType: "ATTENDEE" as const,
              responseStatus: "PENDING" as const,
            })),
          });
        }

        // Add creator as organizer
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            userId: createdById,
            participantType: "ORGANIZER",
            responseStatus: "ACCEPTED",
            respondedAt: new Date(),
          },
        });

        // Add external guest emails
        if (guestEmails.length > 0) {
          await tx.meetingGuest.createMany({
            data: guestEmails.map((email) => ({
              meetingId: newMeeting.id,
              email,
              responseStatus: "PENDING" as const,
            })),
            skipDuplicates: true,
          });
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

    // Sync to Google Calendar (non-blocking)
    this.syncMeetingToGoogleCalendar(meeting).catch((err) =>
      console.error("[meetingService] Google Calendar sync failed:", err),
    );

    return meeting;
  },

  /**
   * Request meeting from another user (pending acceptance)
   */
  async requestMeeting(
    data: CreateMeetingDTO & { targetUserId: string },
  ): Promise<Meeting> {
    const {
      createdById,
      targetUserId,
      title,
      description,
      startTime,
      endTime,
      timezone,
      mode,
      location,
      notes,
    } = data;

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    if (createdById === targetUserId) {
      throw ErrorFactory.validation("Cannot request a meeting with yourself");
    }

    // Validate target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || !targetUser.isActive) {
      throw ErrorFactory.notFound("Target user not found or inactive");
    }

    // Check for conflicts for the target
    const conflicts = await this.detectConflicts({
      userId: targetUserId,
      startTime,
      endTime,
    });

    if (conflicts.length > 0) {
      throw ErrorFactory.conflict(
        "The requested time slot is not available. Please choose another time.",
      );
    }

    const meeting = await prisma.$transaction(
      async (tx) => {
        const newMeeting = await tx.meeting.create({
          data: {
            title,
            description,
            startTime,
            endTime,
            timezone,
            mode,
            status: MeetingStatus.CREATED,
            location,
            notes,
            createdById,
          },
        });

        // Add requester as attendee
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            userId: createdById,
            participantType: "ATTENDEE",
            responseStatus: "PENDING",
          },
        });

        // Add target as organizer
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            userId: targetUserId,
            participantType: "ORGANIZER",
            responseStatus: "PENDING",
          },
        });

        return tx.meeting.findUnique({
          where: { id: newMeeting.id },
          include: meetingInclude,
        });
      },
      { timeout: 15000 },
    );

    if (!meeting) {
      throw ErrorFactory.validation("Failed to create meeting request");
    }

    return meeting;
  },

  /**
   * Update meeting details
   */
  async updateMeeting(
    meetingId: string,
    updatedByUserId: string,
    data: {
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      timezone?: string;
      mode?: "ONLINE" | "IN_PERSON";
      location?: string;
      participantUserIds?: string[];
      notes?: string;
    },
  ): Promise<Meeting> {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Only creator can update
    if (meeting.createdById !== updatedByUserId) {
      throw ErrorFactory.forbidden(
        "Only meeting creator can update this meeting",
      );
    }

    if (["COMPLETED", "CANCELLED", "DECLINED"].includes(meeting.status)) {
      throw ErrorFactory.conflict(
        "Cannot update a completed, cancelled, or declined meeting",
      );
    }

    // If time is being changed, check for conflicts
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

      // Check conflicts for all participants too
      for (const participant of meeting.participants) {
        if (participant.userId !== meeting.createdById) {
          const participantConflicts = await this.detectConflicts({
            userId: participant.userId,
            startTime: newStartTime,
            endTime: newEndTime,
            excludeMeetingId: meetingId,
          });

          if (participantConflicts.length > 0) {
            throw ErrorFactory.conflict(
              "One or more participants has conflicts at the new time",
            );
          }
        }
      }
    }

    // Validate new participants
    if (data.participantUserIds) {
      if (data.participantUserIds.includes(meeting.createdById)) {
        throw ErrorFactory.validation(
          "Meeting creator cannot be in the participants list.",
        );
      }

      const newParticipants = await prisma.user.findMany({
        where: {
          id: { in: data.participantUserIds },
          isActive: true,
        },
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
            ...(data.mode && { mode: data.mode }),
            ...(data.location !== undefined && { location: data.location }),
            ...(data.notes !== undefined && { notes: data.notes }),
          },
        });

        // Update participants if provided
        if (data.participantUserIds) {
          const currentParticipantIds = meeting.participants
            .filter((p) => p.userId !== meeting.createdById)
            .map((p) => p.userId);

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
            await tx.meetingParticipant.createMany({
              data: toAdd.map((userId) => ({
                meetingId,
                userId,
                participantType: "ATTENDEE" as const,
                responseStatus: "PENDING" as const,
              })),
            });
          }
        }

        // State history entry
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

    // Sync to Google Calendar if event exists (non-blocking)
    if (meeting.googleEventId) {
      this.updateGoogleCalendarEvent(updatedMeeting).catch((err) =>
        console.error("[meetingService] Google Calendar sync failed:", err),
      );
    }

    return updatedMeeting;
  },

  /**
   * Accept meeting (participant accepting)
   */
  async acceptMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterUserId } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    const requesterParticipant = meeting.participants.find(
      (p) => p.userId === requesterUserId,
    );

    if (!requesterParticipant) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be accepted",
      );
    }

    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        await tx.meetingParticipant.update({
          where: {
            meetingId_userId: { meetingId, userId: requesterUserId },
          },
          data: {
            responseStatus: "ACCEPTED",
            respondedAt: new Date(),
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
      throw ErrorFactory.notFound("Meeting not found");
    }

    // Sync to Google Calendar if no event yet (non-blocking)
    if (!meeting.googleEventId) {
      this.syncMeetingToGoogleCalendar(updatedMeeting).catch((err) =>
        console.error("[meetingService] Google Calendar sync failed:", err),
      );
    }

    return updatedMeeting;
  },

  /**
   * Decline meeting
   */
  async declineMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterUserId } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    const requesterParticipant = meeting.participants.find(
      (p) => p.userId === requesterUserId,
    );

    if (!requesterParticipant) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be declined",
      );
    }

    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        await tx.meetingParticipant.update({
          where: {
            meetingId_userId: { meetingId, userId: requesterUserId },
          },
          data: {
            responseStatus: "DECLINED",
            respondedAt: new Date(),
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
      throw ErrorFactory.notFound("Meeting not found");
    }

    return updatedMeeting;
  },

  /**
   * Cancel meeting
   */
  async cancelMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterUserId, reason } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    const requesterParticipant = meeting.participants.find(
      (p) => p.userId === requesterUserId,
    );

    if (!requesterParticipant) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    const updatedMeeting = await prisma.$transaction(
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

    // Delete from Google Calendar (non-blocking)
    if (meeting.googleEventId) {
      this.deleteGoogleCalendarEvent(
        meeting.createdById,
        meeting.googleEventId,
      ).catch((err) =>
        console.error("[meetingService] Google Calendar delete failed:", err),
      );
    }

    return updatedMeeting;
  },

  /**
   * Mark meeting as completed
   */
  async completeMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterUserId } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    const requesterParticipant = meeting.participants.find(
      (p) => p.userId === requesterUserId,
    );

    if (
      !requesterParticipant ||
      requesterParticipant.participantType !== "ORGANIZER"
    ) {
      throw ErrorFactory.forbidden(
        "Only the organizer can mark meeting as completed",
      );
    }

    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be marked as completed",
      );
    }

    const pendingAttendees = meeting.participants.filter(
      (p) =>
        p.participantType === "ATTENDEE" && p.responseStatus !== "ACCEPTED",
    );

    if (pendingAttendees.length > 0) {
      throw ErrorFactory.conflict(
        `Cannot complete meeting: ${pendingAttendees.length} attendee(s) have not yet accepted`,
      );
    }

    const updatedMeeting = await prisma.$transaction(
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

    return updatedMeeting;
  },

  /**
   * Propose meeting reschedule
   */
  async proposeReschedule(data: RescheduleRequestDTO): Promise<any> {
    const {
      meetingId,
      proposedStartTime,
      proposedEndTime,
      requestedByUserId,
      reason,
    } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    const requester = meeting.participants.find(
      (p) => p.userId === requestedByUserId,
    );
    if (!requester) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    if (proposedStartTime >= proposedEndTime) {
      throw ErrorFactory.validation(
        "Proposed start time must be before end time",
      );
    }

    return prisma.$transaction(
      async (tx) => {
        const request = await tx.meetingRescheduleRequest.create({
          data: {
            meetingId,
            requestedById: requestedByUserId,
            proposedStartTime,
            proposedEndTime,
            reason,
            status: "PENDING",
          },
        });

        await tx.meeting.update({
          where: { id: meetingId },
          data: { status: MeetingStatus.RESCHEDULING_REQUESTED },
        });

        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: meeting.status,
            toStatus: MeetingStatus.RESCHEDULING_REQUESTED,
            changedById: requestedByUserId,
            reason: reason || "Reschedule requested",
          },
        });

        return request;
      },
      { timeout: 15000 },
    );
  },

  /**
   * Respond to reschedule request
   */
  async respondToReschedule(data: RespondToRescheduleDTO): Promise<Meeting> {
    const { rescheduleRequestId, respondedByUserId, accepted, responseNotes } =
      data;

    const rescheduleRequest = await prisma.meetingRescheduleRequest.findUnique({
      where: { id: rescheduleRequestId },
      include: { meeting: { include: { participants: true } } },
    });

    if (!rescheduleRequest) {
      throw ErrorFactory.notFound("Reschedule request");
    }

    const meeting = rescheduleRequest.meeting;

    const responder = meeting.participants.find(
      (p) => p.userId === respondedByUserId,
    );
    if (!responder || rescheduleRequest.requestedById === respondedByUserId) {
      throw ErrorFactory.forbidden(
        "Only the other participant can respond to this reschedule",
      );
    }

    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        let updated;

        if (accepted) {
          const conflicts = await this.detectConflicts({
            userId: meeting.createdById,
            startTime: rescheduleRequest.proposedStartTime,
            endTime: rescheduleRequest.proposedEndTime,
            excludeMeetingId: meeting.id,
          });

          if (conflicts.length > 0) {
            throw ErrorFactory.conflict("Proposed time has conflicts");
          }

          updated = await tx.meeting.update({
            where: { id: meeting.id },
            data: {
              startTime: rescheduleRequest.proposedStartTime,
              endTime: rescheduleRequest.proposedEndTime,
              status: MeetingStatus.CREATED,
            },
            include: meetingInclude,
          });

          // Update Google Calendar
          if (meeting.googleEventId) {
            this.updateGoogleCalendarEvent(updated).catch((err) =>
              console.error(
                "[meetingService] Google Calendar sync failed:",
                err,
              ),
            );
          }
        } else {
          updated = await tx.meeting.update({
            where: { id: meeting.id },
            data: { status: MeetingStatus.CREATED },
            include: meetingInclude,
          });
        }

        await tx.meetingRescheduleRequest.update({
          where: { id: rescheduleRequestId },
          data: {
            status: accepted ? "ACCEPTED" : "DECLINED",
            respondedById: respondedByUserId,
            respondedAt: new Date(),
            responseNotes,
          },
        });

        await tx.meetingStateHistory.create({
          data: {
            meetingId: meeting.id,
            fromStatus: MeetingStatus.RESCHEDULING_REQUESTED,
            toStatus: MeetingStatus.CREATED,
            changedById: respondedByUserId,
            reason: accepted ? "Reschedule accepted" : "Reschedule declined",
          },
        });

        return updated;
      },
      { timeout: 15000 },
    );

    return updatedMeeting;
  },

  /**
   * Get reschedule requests for a meeting
   */
  async getRescheduleRequests(meetingId: string): Promise<any[]> {
    const requests = await prisma.meetingRescheduleRequest.findMany({
      where: { meetingId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return requests;
  },

  /**
   * Update guest response to meeting invitation
   */
  async respondToGuestInvitation(
    meetingId: string,
    guestEmail: string,
    accepted: boolean,
  ): Promise<{ success: boolean; message: string }> {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { guests: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting not found");
    }

    const guest = meeting.guests.find((g) => g.email === guestEmail);
    if (!guest) {
      throw ErrorFactory.notFound("Guest not found for this meeting");
    }

    await prisma.meetingGuest.update({
      where: { id: guest.id },
      data: {
        responseStatus: accepted ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
      },
    });

    return {
      success: true,
      message: accepted
        ? `You have accepted the meeting invitation for "${meeting.title}"`
        : `You have declined the meeting invitation for "${meeting.title}"`,
    };
  },

  /**
   * Get meetings for a user with filters
   */
  async getMeetings(params: {
    userId: string;
    status?: MeetingStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<(Meeting & { participants: MeetingParticipant[] })[]> {
    const {
      userId,
      status,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
    } = params;

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) (where.startTime as any).gte = startDate;
      if (endDate) (where.startTime as any).lte = endDate;
    }

    return prisma.meeting.findMany({
      where,
      include: meetingInclude,
      orderBy: { startTime: "asc" },
      take: limit,
      skip: offset,
    }) as any;
  },

  /**
   * Get meetings without pagination (max 1000 results for calendar view)
   */
  async getMeetingsWithoutPagination(params: {
    userId: string;
    status?: MeetingStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<(Meeting & { participants: MeetingParticipant[] })[]> {
    const { userId, status, startDate, endDate } = params;

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    };

    if (status) where.status = status;

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) (where.startTime as any).gte = startDate;
      if (endDate) (where.startTime as any).lte = endDate;
    }

    return prisma.meeting.findMany({
      where,
      include: meetingInclude,
      orderBy: { startTime: "asc" },
      take: 1000,
    }) as any;
  },

  /**
   * Detect conflicts for a user's time slot (across all meetings)
   */
  async detectConflicts(params: ConflictDetectionParams): Promise<any[]> {
    const { userId, startTime, endTime, excludeMeetingId } = params;

    const conflicts = [];

    // Check overlapping meetings
    const meetings = await prisma.meeting.findMany({
      where: {
        isDeleted: false,
        id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
        status: { in: [MeetingStatus.CREATED, MeetingStatus.ACCEPTED] },
        OR: [{ createdById: userId }, { participants: { some: { userId } } }],
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    for (const meeting of meetings) {
      conflicts.push({
        type: "MEETING",
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        details: `Meeting "${meeting.title}" at ${meeting.startTime.toLocaleTimeString()} - ${meeting.endTime.toLocaleTimeString()}`,
      });
    }

    return conflicts;
  },

  /**
   * Create meeting from public booking (no auth)
   */
  async createPublicBooking(data: {
    userId: string; // The user being booked
    eventTypeId: string;
    guestEmail: string;
    guestName: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    guestMessage?: string;
  }): Promise<Meeting> {
    const {
      userId,
      eventTypeId,
      guestEmail,
      guestName,
      startTime,
      endTime,
      timezone,
      guestMessage,
    } = data;

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate user is active
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw ErrorFactory.notFound("User not available");
    }

    // Validate event type
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });
    if (!eventType || eventType.userId !== userId || !eventType.isActive) {
      throw ErrorFactory.notFound("Event type not found or inactive");
    }

    // Check for conflicts
    const conflicts = await this.detectConflicts({
      userId,
      startTime,
      endTime,
    });

    if (conflicts.length > 0) {
      throw ErrorFactory.conflict(
        "Requested time slot is not available. Please choose another time.",
      );
    }

    const meeting = await prisma.$transaction(
      async (tx) => {
        const newMeeting = await tx.meeting.create({
          data: {
            title: eventType.title,
            startTime,
            endTime,
            timezone,
            mode: "ONLINE",
            status: MeetingStatus.CREATED,
            createdById: userId,
            eventTypeId,
            guestEmail,
            guestName,
            guestMessage,
          },
        });

        // Add host as organizer
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            userId,
            participantType: "ORGANIZER",
            responseStatus: "ACCEPTED",
            respondedAt: new Date(),
          },
        });

        return tx.meeting.findUnique({
          where: { id: newMeeting.id },
          include: meetingInclude,
        });
      },
      { timeout: 15000 },
    );

    if (!meeting) {
      throw ErrorFactory.validation("Failed to create booking");
    }

    // Sync to Google Calendar (non-blocking)
    try {
      const googleEvent = await googleService.createEvent(userId, {
        summary: eventType.title,
        description: `Guest: ${guestName} (${guestEmail})${guestMessage ? `\nMessage: ${guestMessage}` : ""}`,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        conferenceData: {
          createRequest: {
            requestId: `${meeting.id}-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        attendees: [{ email: guestEmail }],
      });

      if (googleEvent) {
        const meetLink =
          googleEvent.conferenceData?.entryPoints?.[0]?.uri ||
          googleEvent.hangoutLink ||
          null;
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            meetingLink: meetLink,
            googleEventId: googleEvent.id || meeting.id,
          },
        });
      }
    } catch (syncError) {
      console.error(
        "[meetingService] Failed to sync public booking to Google Calendar:",
        syncError,
      );
    }

    return meeting;
  },

  /**
   * Helper: Sync meeting to Google Calendar
   */
  async syncMeetingToGoogleCalendar(meeting: any): Promise<void> {
    try {
      const participants = meeting.participants || [];
      const attendees = participants
        .filter((p: any) => p.userId !== meeting.createdById)
        .map((p: any) => ({ email: p.user?.email }))
        .filter((a: any) => a.email);

      const googleEvent = await googleService.createEvent(meeting.createdById, {
        summary: meeting.title,
        description: meeting.description || "",
        start: meeting.startTime.toISOString(),
        end: meeting.endTime.toISOString(),
        conferenceData:
          meeting.mode === "ONLINE"
            ? {
                createRequest: {
                  requestId: `${meeting.id}-${Date.now()}`,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              }
            : undefined,
        attendees: attendees.length > 0 ? attendees : undefined,
      });

      if (googleEvent) {
        const meetLink =
          googleEvent.conferenceData?.entryPoints?.[0]?.uri ||
          googleEvent.hangoutLink ||
          null;
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            meetingLink: meetLink,
            googleEventId: googleEvent.id || meeting.id,
          },
        });
      }
    } catch (err) {
      console.error("[meetingService] Google Calendar sync error:", err);
    }
  },

  /**
   * Helper: Update Google Calendar event
   */
  async updateGoogleCalendarEvent(meeting: any): Promise<void> {
    if (!meeting.googleEventId) return;

    try {
      const participants = meeting.participants || [];
      const attendees = participants
        .filter((p: any) => p.userId !== meeting.createdById)
        .map((p: any) => ({ email: p.user?.email }))
        .filter((a: any) => a.email);

      await googleService.updateEvent(
        meeting.createdById,
        meeting.googleEventId,
        {
          summary: meeting.title,
          description: meeting.description || "",
          start: meeting.startTime.toISOString(),
          end: meeting.endTime.toISOString(),
          attendees: attendees.length > 0 ? attendees : undefined,
        },
      );
    } catch (err) {
      console.error("[meetingService] Google Calendar update error:", err);
    }
  },

  /**
   * Helper: Delete Google Calendar event
   */
  async deleteGoogleCalendarEvent(
    userId: string,
    googleEventId: string,
  ): Promise<void> {
    try {
      await googleService.deleteEvent(userId, googleEventId);
    } catch (err) {
      console.error("[meetingService] Google Calendar delete error:", err);
    }
  },
};
