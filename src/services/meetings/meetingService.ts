import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import {
  Meeting,
  MeetingStatus,
  MeetingType,
  MeetingParticipant,
  Prisma,
} from "@prisma/client";
import {
  createGCalEventForMeeting,
  updateGCalEventForMeeting,
  deleteCalendarEvent,
} from "../googleCalendarService";

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
  async createMeeting(data: CreateMeetingDTO): Promise<Meeting> {
    const {
      createdById,
      description,
      type = MeetingType.SCHEDULED,
      timezone,
      location,
      participantUserIds,
      notes,
    } = data;

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
          },
        });

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
            await tx.meetingParticipant.createMany({
              data: participantUserIds.map((userId) => ({
                meetingId: newMeeting.id,
                userId,
                participantType: "ATTENDEE" as const,
              })),
            });
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

    // Create Google Calendar event for SCHEDULED meetings when requested.
    // Includes conference data to generate a Meet URL in a single API call.
    // Fail-open: GCal failure never prevents the meeting from being created.
    if (data.addToCalendar === true && isScheduled) {
      try {
        const gcalResult = await createGCalEventForMeeting(createdById, {
          title: meeting.title,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          timezone: meeting.timezone,
          location: meeting.location,
          description: meeting.description,
          requestMeetLink: true,
        });
        if (gcalResult) {
          return await prisma.meeting.update({
            where: { id: meeting.id },
            data: {
              googleEventId: gcalResult.googleEventId,
              ...(gcalResult.meetLink ? { meetLink: gcalResult.meetLink } : {}),
            },
            include: meetingInclude,
          });
        }
      } catch {
        // fail-open — meeting is already committed
      }
    }

    return meeting;
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
    },
  ): Promise<Meeting> {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, createdById: updatedByUserId, isDeleted: false },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        timezone: true,
        createdById: true,
        googleEventId: true,
        participants: { select: { userId: true, participantType: true } },
      },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
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
        (p) => p.userId !== meeting.createdById,
      );
      const participantConflictResults = await Promise.all(
        otherParticipants.map((p) =>
          this.detectConflicts({
            userId: p.userId,
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
              })),
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
    }

    return updatedMeeting;
  },

  async cancelMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterUserId, reason } = data;

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, createdById: requesterUserId, isDeleted: false },
      select: { id: true, status: true, googleEventId: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

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

  async completeMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterUserId } = data;

    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        isDeleted: false,
        OR: [
          { createdById: requesterUserId },
          {
            participants: {
              some: { userId: requesterUserId, participantType: "ORGANIZER" },
            },
          },
        ],
      },
      select: { id: true, status: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

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
  }): Promise<{
    meetings: (Meeting & { participants: MeetingParticipant[] })[];
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
    } = params;

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
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
        include: meetingInclude,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }) as any,
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
  }): Promise<{
    meetings: (Meeting & { participants: MeetingParticipant[] })[];
    truncated: boolean;
  }> {
    const { userId, status, type, startDate, endDate } = params;

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
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
    const rows = (await prisma.meeting.findMany({
      where,
      include: meetingInclude,
      orderBy: { createdAt: "desc" },
      take: MAX_CALENDAR_MEETINGS + 1,
    })) as any[];

    const truncated = rows.length > MAX_CALENDAR_MEETINGS;
    return {
      meetings: truncated ? rows.slice(0, MAX_CALENDAR_MEETINGS) : rows,
      truncated,
    };
  },

  async detectConflicts(params: ConflictDetectionParams): Promise<any[]> {
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

  async deleteMeeting(meetingId: string, userId: string): Promise<void> {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, isDeleted: false, createdById: userId },
      select: { googleEventId: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    const result = await prisma.meeting.updateMany({
      where: { id: meetingId, isDeleted: false, createdById: userId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });

    if (result.count === 0) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Remove from Google Calendar after DB is committed. Fail-open.
    await deleteCalendarEvent(userId, meeting.googleEventId);
  },
};
