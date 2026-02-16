import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import {
  Meeting,
  MeetingStatus,
  MeetingParticipant,
  UserRoleEnum,
  Prisma,
} from "@prisma/client";
import { googleService } from "../googleService";
import { availabilityService } from "./availabilityService";
import { sendNotification } from "../../utils/notificationServiceUtils";
import { randomUUID } from "crypto";
import {
  generateMeetingICS,
  encodeICSToBase64,
} from "../../utils/icsGenerator";

export interface CreateMeetingDTO {
  organizationId: string;
  createdById: string;
  createdByRole: UserRoleEnum | null;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  mode: "ONLINE" | "IN_PERSON";
  location?: string;
  participantMemberIds?: string[];
  guestEmails?: string[];
  notes?: string;
}

export interface RequestMeetingDTO extends CreateMeetingDTO {
  orgMemberId?: string;
}

export interface UpdateMeetingStatusDTO {
  meetingId: string;
  newStatus: MeetingStatus;
  requesterMemberId: string;
  reason?: string;
}

export interface RescheduleRequestDTO {
  meetingId: string;
  proposedStartTime: Date;
  proposedEndTime: Date;
  requestedByMemberId: string;
  reason?: string;
}

export interface RespondToRescheduleDTO {
  rescheduleRequestId: string;
  respondedByMemberId: string;
  accepted: boolean;
  responseNotes?: string;
}

export interface ConflictDetectionParams {
  orgMemberId: string;
  startTime: Date;
  endTime: Date;
  excludeMeetingId?: string;
}

export const meetingService = {
  /**
   * Create meeting by consultant with assigned students (auto-accepted)
   */
  async createMeetingByConsultant(data: CreateMeetingDTO): Promise<Meeting> {
    const {
      organizationId,
      createdById,
      createdByRole,
      title,
      description,
      startTime,
      endTime,
      timezone,
      mode,
      location,
      participantMemberIds,
      guestEmails = [],
      notes,
    } = data;

    // Validate consultant has permission to create meetings
    if (
      !createdByRole ||
      !["OWNER", "ADMIN", "MEMBER"].includes(createdByRole)
    ) {
      throw ErrorFactory.forbidden(
        "Only consultants or admins can create meetings",
      );
    }

    // Validate time range
    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate creator is not in participant list
    if (participantMemberIds && participantMemberIds.includes(createdById)) {
      throw ErrorFactory.validation(
        "Meeting creator cannot be included in the participants list. The creator is automatically added as the organizer.",
      );
    }

    // Validate all participants exist and are active (only if participantMemberIds provided)
    if (participantMemberIds && participantMemberIds.length > 0) {
      const participants = await prisma.organizationMember.findMany({
        where: {
          id: { in: participantMemberIds },
          orgId: organizationId,
        },
        include: {
          user: { select: { isActive: true } },
        },
      });

      if (participants.length !== participantMemberIds.length) {
        throw ErrorFactory.notFound(
          "Some participants not found in organization",
        );
      }

      for (const participant of participants) {
        if (!participant.user.isActive) {
          throw ErrorFactory.validation(
            "Cannot add inactive participants to meeting",
          );
        }
      }
    }

    // Check for conflicts
    const conflicts = await this.detectConflicts({
      orgMemberId: createdById,
      startTime,
      endTime,
    });

    if (conflicts.length > 0) {
      throw ErrorFactory.conflict(
        `Consultant has conflicting meetings at this time: ${conflicts.map((c) => c.details).join(", ")}`,
      );
    }

    // Create meeting in transaction
    const meeting = await prisma.$transaction(
      async (tx) => {
        // Create meeting with CREATED status
        const newMeeting = await tx.meeting.create({
          data: {
            title,
            description,
            startTime,
            endTime,
            timezone,
            mode: mode as "ONLINE" | "IN_PERSON",
            status: MeetingStatus.CREATED,
            location,
            notes,
            createdById,
            createdByRole,
            organizationId,
          },
        });

        // Create participants (students must accept) - only if participantMemberIds provided
        if (participantMemberIds && participantMemberIds.length > 0) {
          await tx.meetingParticipant.createMany({
            data: participantMemberIds.map((memberId) => ({
              meetingId: newMeeting.id,
              orgMemberId: memberId,
              participantType: "ATTENDEE",
              responseStatus: "PENDING",
            })),
          });
        }

        // Add creator as organizer (ADMIN/CONSULTANT/MENTOR all become CONSULTANT type)
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            orgMemberId: createdById,
            participantType: "ORGANIZER",
            responseStatus: "ACCEPTED",
            respondedAt: new Date(),
          },
        });

        // Add external guest emails if provided
        if (guestEmails && guestEmails.length > 0) {
          await tx.meetingGuest.createMany({
            data: guestEmails.map((email) => ({
              meetingId: newMeeting.id,
              email,
              responseStatus: "PENDING",
            })),
            skipDuplicates: true, // Skip if email already exists for this meeting
          });
        }

        // No state history needed for creation - meeting status is simply CREATED

        // Re-fetch meeting with all relations after creating participants
        const finalMeeting = await tx.meeting.findUnique({
          where: { id: newMeeting.id },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            guests: true,
            stateHistory: true,
          },
        });

        return finalMeeting;
      },
      { timeout: 15000 },
    );

    if (!meeting) {
      throw ErrorFactory.validation("Failed to create meeting");
    }

    // Add response links to guests for frontend
    const baseUrl = process.env.FRONTEND_URL;
    if (!baseUrl) {
      throw new Error("FRONTEND_URL environment variable is required");
    }
    const guestsWithLinks =
      meeting.guests?.map((guest) => ({
        ...guest,
        acceptLink: `${baseUrl}/meetings/${meeting.id}/guests/${guest.email}/accept`,
        declineLink: `${baseUrl}/meetings/${meeting.id}/guests/${guest.email}/decline`,
      })) || [];

    // Add the response links to the meeting object
    const meetingWithGuestLinks = {
      ...meeting,
      guests: guestsWithLinks,
    };

    // Sync to Google Calendar (non-blocking)
    try {
      const creator = await prisma.organizationMember.findUnique({
        where: { id: createdById },
        include: { user: true },
      });

      if (creator?.user.id) {
        // Get participant emails for attendees
        const participants = await prisma.organizationMember.findMany({
          where: {
            id: { in: participantMemberIds },
          },
          include: { user: true },
        });

        const attendees = participants
          .map((p) => ({ email: p.user.email }))
          .filter((a) => a.email);

        const googleEvent = await googleService.createEvent(creator.user.id, {
          summary: title,
          description: description || "",
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          conferenceData:
            mode === "ONLINE"
              ? {
                  createRequest: {
                    requestId: `${meeting.id}-${Date.now()}`,
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                  },
                }
              : undefined,
          attendees: attendees.length > 0 ? attendees : undefined,
        });

        // Update meeting with Google event ID and link
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
      }
    } catch (syncError) {
      console.error(
        `[meetingService] Failed to sync meeting to Google Calendar:`,
        syncError,
      );
      // Non-blocking: don't fail meeting creation if sync fails
    }

    // Send invitation emails to external guests (non-blocking)
    if (guestEmails && guestEmails.length > 0) {
      try {
        const creator = await prisma.organizationMember.findUnique({
          where: { id: createdById },
          include: { user: true },
        });

        if (!creator) {
          throw new Error("Creator org member not found");
        }

        // Format meeting date/time for email
        const meetingDate = startTime.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const meetingTime = startTime.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        // Generate .ics attachment (in-memory, serverless-safe)
        let icsAttachment:
          | { filename: string; base64: string; type?: string }
          | undefined;
        try {
          const icsContent = generateMeetingICS({
            title,
            description: description || "",
            startTime,
            endTime,
            organizer: {
              name: creator.user.name || "Organizer",
              email: creator.user.email,
            },
            attendee: {
              name: "Guest",
              email: guestEmails[0] || "guest@example.com", // Placeholder, will vary per guest
            },
            location: mode === "IN_PERSON" ? location : undefined,
            url:
              mode === "ONLINE" ? meeting.meetingLink || undefined : undefined,
          });

          const icsBase64 = encodeICSToBase64(icsContent);
          icsAttachment = {
            filename: "meeting.ics",
            base64: icsBase64,
            type: "text/calendar",
          };
        } catch (icsError) {
          console.warn(
            `[meetingService] Failed to generate .ics attachment:`,
            icsError,
          );
          // Continue without attachment if generation fails
        }

        // Send notification to each guest
        for (const guestEmail of guestEmails) {
          try {
            // Generate frontend links for guest to respond
            const baseUrl = process.env.FRONTEND_URL;
            if (!baseUrl) {
              throw new Error("FRONTEND_URL environment variable is required");
            }
            const acceptLink = `${baseUrl}/meetings/${meeting.id}/guests/${guestEmail}/accept`;
            const declineLink = `${baseUrl}/meetings/${meeting.id}/guests/${guestEmail}/decline`;

            await sendNotification({
              orgId: organizationId,
              sender: {
                email: creator.user.email,
                name: creator.user.name,
                role: createdByRole || "ADMIN",
              },
              recipient: {
                email: guestEmail,
                name: guestEmail,
                role: "GUEST",
              },
              event: "MEETING_GUEST_INVITED",
              payload: {
                GUEST_NAME: guestEmail,
                ORGANIZER_NAME: creator.user.name,
                ORGANIZER_EMAIL: creator.user.email,
                MEETING_TITLE: title,
                MEETING_DATE: meetingDate,
                MEETING_TIME: meetingTime,
                ACCEPT_LINK: acceptLink,
                DECLINE_LINK: declineLink,
              },
              attachments: icsAttachment ? [icsAttachment] : undefined,
            });
          } catch (guestEmailError) {
            console.error(
              `[meetingService] Failed to send invitation to guest ${guestEmail}:`,
              guestEmailError,
            );
            // Continue with next guest even if one fails
          }
        }
      } catch (guestNotificationError) {
        console.error(
          `[meetingService] Failed to send guest invitations:`,
          guestNotificationError,
        );
        // Non-blocking: don't fail meeting creation if notifications fail
      }
    }

    return meetingWithGuestLinks;
  },

  /**
   * Request meeting from another member (pending acceptance)
   * Simplified Calendly-style: Any member can request a meeting from any other member in the same org
   */
  async requestMeetingByMember(data: RequestMeetingDTO): Promise<Meeting> {
    const {
      organizationId,
      createdById,
      createdByRole,
      orgMemberId,
      title,
      description,
      startTime,
      endTime,
      timezone,
      mode,
      location,
      notes,
    } = data;

    // orgMemberId is required for this function
    if (!orgMemberId) {
      throw ErrorFactory.validation("Target member ID is required");
    }

    // Validate time range
    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate both members are in the same organization
    const requestingMember = await prisma.organizationMember.findUnique({
      where: { id: createdById },
      include: { user: true },
    });

    const targetMember = await prisma.organizationMember.findFirst({
      where: {
        id: orgMemberId,
        orgId: organizationId,
      },
      include: { user: true },
    });

    if (!requestingMember || !targetMember) {
      throw ErrorFactory.notFound("Member not found");
    }

    if (requestingMember.orgId !== targetMember.orgId) {
      throw ErrorFactory.forbidden(
        "Both participants must be in the same organization",
      );
    }

    if (!targetMember.user.isActive) {
      throw ErrorFactory.notFound("Target member not found or inactive");
    }

    // Check for conflicts for the consultant
    const conflicts = await this.detectConflicts({
      orgMemberId,
      startTime,
      endTime,
    });

    if (conflicts.length > 0) {
      throw ErrorFactory.conflict(
        `Consultant has conflicting meetings at this time: ${conflicts.map((c) => c.details).join(", ")}`,
      );
    }

    // Create meeting in transaction
    const meeting = await prisma.$transaction(
      async (tx) => {
        const newMeeting = await tx.meeting.create({
          data: {
            title,
            description,
            startTime,
            endTime,
            timezone,
            mode: mode as "ONLINE" | "IN_PERSON",
            status: MeetingStatus.CREATED,
            location,
            notes,
            createdById,
            createdByRole,
            organizationId,
          },
        });

        // Add requester as attendee
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            orgMemberId: createdById,
            participantType: "ATTENDEE",
            responseStatus: "PENDING",
          },
        });

        // Add target member as organizer
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            orgMemberId: orgMemberId,
            participantType: "ORGANIZER",
            responseStatus: "PENDING",
          },
        });

        // No state history needed for creation - meeting status is simply CREATED

        // Re-fetch meeting with all relations after creating participants
        const finalMeeting = await tx.meeting.findUnique({
          where: { id: newMeeting.id },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            guests: true,
            stateHistory: true,
          },
        });

        return finalMeeting;
      },
      { timeout: 15000 },
    );

    if (!meeting) {
      throw ErrorFactory.validation("Failed to create meeting request");
    }

    return meeting;
  },

  /**
   * Update meeting details (title, description, time, participants, etc.)
   */
  async updateMeeting(
    meetingId: string,
    updatedBy: string,
    data: {
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      timezone?: string;
      mode?: "ONLINE" | "IN_PERSON";
      location?: string;
      participantMemberIds?: string[];
      notes?: string;
    },
  ): Promise<Meeting> {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        participants: true,
      },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Validate requester is meeting creator or ADMIN/OWNER
    const requesterMember = await prisma.organizationMember.findUnique({
      where: { id: updatedBy },
    });

    if (!requesterMember) {
      throw ErrorFactory.forbidden("User not found");
    }

    // Only creator or ADMIN/OWNER can update
    if (
      meeting.createdById !== updatedBy &&
      !["OWNER", "ADMIN"].includes(requesterMember.accessLevel)
    ) {
      throw ErrorFactory.forbidden(
        "Only meeting creator or admin can update this meeting",
      );
    }

    // Validate meeting can be edited (not completed or cancelled)
    if (["COMPLETED", "CANCELLED", "DECLINED"].includes(meeting.status)) {
      throw ErrorFactory.conflict(
        "Cannot update a completed, cancelled, or declined meeting",
      );
    }

    // If time is being changed, check for conflicts
    let conflicts: any[] = [];
    const newStartTime = data.startTime || meeting.startTime;
    const newEndTime = data.endTime || meeting.endTime;

    if (data.startTime || data.endTime) {
      // Check conflicts for meeting creator
      conflicts = await this.detectConflicts({
        orgMemberId: meeting.createdById,
        startTime: newStartTime,
        endTime: newEndTime,
        excludeMeetingId: meetingId,
      });

      if (conflicts.length > 0) {
        throw ErrorFactory.conflict(
          `Meeting time is not available: ${conflicts.map((c) => c.details).join(", ")}`,
        );
      }

      // Also check conflicts for all participants if time changed
      const participants = await prisma.meetingParticipant.findMany({
        where: { meetingId },
      });

      for (const participant of participants) {
        if (participant.orgMemberId !== meeting.createdById) {
          const participantConflicts = await this.detectConflicts({
            orgMemberId: participant.orgMemberId,
            startTime: newStartTime,
            endTime: newEndTime,
            excludeMeetingId: meetingId,
          });

          if (participantConflicts.length > 0) {
            throw ErrorFactory.conflict(
              `One or more participants has conflicts at the new time`,
            );
          }
        }
      }
    }

    // If participants are being changed, validate they exist and are active
    if (data.participantMemberIds) {
      // Validate creator is not in participant list
      if (data.participantMemberIds.includes(meeting.createdById)) {
        throw ErrorFactory.validation(
          "Meeting creator cannot be included in the participants list. The creator is automatically the organizer.",
        );
      }

      const newParticipants = await prisma.organizationMember.findMany({
        where: {
          id: { in: data.participantMemberIds },
          orgId: meeting.organizationId,
        },
        include: {
          user: { select: { isActive: true } },
        },
      });

      if (newParticipants.length !== data.participantMemberIds.length) {
        throw ErrorFactory.notFound(
          "Some participants not found in organization",
        );
      }

      for (const participant of newParticipants) {
        if (!participant.user.isActive) {
          throw ErrorFactory.validation(
            "Cannot add inactive participants to meeting",
          );
        }
      }
    }

    // Update meeting in transaction
    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        // Update meeting details
        const updated = await tx.meeting.update({
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
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });

        // Update participants if provided
        if (data.participantMemberIds) {
          const currentParticipantIds = meeting.participants
            .filter((p) => p.orgMemberId !== meeting.createdById)
            .map((p) => p.orgMemberId);

          const toRemove = currentParticipantIds.filter(
            (id) => !data.participantMemberIds!.includes(id),
          );
          const toAdd = data.participantMemberIds.filter(
            (id) => !currentParticipantIds.includes(id),
          );

          // Remove participants
          if (toRemove.length > 0) {
            await tx.meetingParticipant.deleteMany({
              where: {
                meetingId,
                orgMemberId: { in: toRemove },
              },
            });
          }

          // Add new participants (always PENDING, they need to accept)
          if (toAdd.length > 0) {
            await tx.meetingParticipant.createMany({
              data: toAdd.map((memberId) => ({
                meetingId,
                orgMemberId: memberId,
                participantType: "ATTENDEE",
                responseStatus: "PENDING",
              })),
            });
          }
        }

        // Create state history entry if there are changes
        const hasChanges = Object.values(data).some((v) => v !== undefined);
        if (hasChanges) {
          await tx.meetingStateHistory.create({
            data: {
              meetingId,
              fromStatus: meeting.status,
              toStatus: meeting.status,
              changedById: updatedBy,
              reason: "Meeting details updated",
            },
          });
        }

        // Re-fetch meeting with all relations
        return await tx.meeting.findUnique({
          where: { id: meetingId },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });
      },
      { timeout: 15000 },
    );

    if (!updatedMeeting) {
      throw ErrorFactory.validation("Failed to update meeting");
    }

    // Sync to Google Calendar if event exists (non-blocking)
    if (
      meeting.googleEventId &&
      (data.startTime || data.endTime || data.title || data.description)
    ) {
      try {
        const creator = await prisma.organizationMember.findUnique({
          where: { id: meeting.createdById },
          include: { user: true },
        });

        if (creator?.user.id) {
          const meetingParticipants = await prisma.meetingParticipant.findMany({
            where: { meetingId },
            include: {
              orgMember: { include: { user: true } },
            },
          });

          const attendees = meetingParticipants
            .filter((p) => p.orgMemberId !== meeting.createdById)
            .map((p) => ({ email: p.orgMember.user.email }))
            .filter((a) => a.email);

          await googleService.updateEvent(
            creator.user.id,
            meeting.googleEventId,
            {
              summary: data.title || meeting.title,
              description:
                data.description !== undefined
                  ? data.description
                  : meeting.description || "",
              start: (data.startTime || meeting.startTime).toISOString(),
              end: (data.endTime || meeting.endTime).toISOString(),
              conferenceData:
                (data.mode || meeting.mode) === "ONLINE"
                  ? {
                      createRequest: {
                        requestId: `${meetingId}-${Date.now()}`,
                        conferenceSolutionKey: { type: "hangoutsMeet" },
                      },
                    }
                  : undefined,
              attendees: attendees.length > 0 ? attendees : undefined,
            },
          );
        }
      } catch (syncError) {
        console.error(
          `[meetingService] Failed to sync updated meeting to Google Calendar:`,
          syncError,
        );
        // Non-blocking: don't fail if sync fails
      }
    }

    return updatedMeeting;
  },

  /**
   * Accept meeting request (consultant accepting student request)
   */
  async acceptMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterMemberId, reason } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Validate requester is a participant
    const requesterParticipant = meeting.participants.find(
      (p) => p.orgMemberId === requesterMemberId,
    );

    if (!requesterParticipant) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    // Validate meeting is in CREATED status
    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be accepted",
      );
    }

    // Re-check for conflicts inside transaction
    const conflicts = await this.detectConflicts({
      orgMemberId: meeting.createdById,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      excludeMeetingId: meetingId,
    });

    if (conflicts.length > 0) {
      throw ErrorFactory.conflict(
        `Meeting time is no longer available: ${conflicts.map((c) => c.details).join(", ")}`,
      );
    }

    // Update meeting in transaction - only update participant response, not meeting status
    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        // Update only the participant response
        await tx.meetingParticipant.update({
          where: {
            meetingId_orgMemberId: {
              meetingId,
              orgMemberId: requesterMemberId,
            },
          },
          data: {
            responseStatus: "ACCEPTED",
            respondedAt: new Date(),
          },
        });

        // Fetch the updated meeting with all relations
        const updated = await tx.meeting.findUnique({
          where: { id: meetingId },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });

        if (!updated) {
          throw ErrorFactory.notFound("Meeting not found");
        }

        return updated;
      },
      { timeout: 15000 },
    );

    // Sync to Google Calendar (non-blocking)
    try {
      const creator = await prisma.organizationMember.findUnique({
        where: { id: meeting.createdById },
        include: { user: true },
      });

      if (creator?.user.id && !meeting.googleEventId) {
        // Get participant emails for attendees
        const meetingParticipants = await prisma.meetingParticipant.findMany({
          where: { meetingId },
          include: {
            orgMember: { include: { user: true } },
          },
        });

        const attendees = meetingParticipants
          .filter((p) => p.orgMemberId !== meeting.createdById) // Exclude organizer
          .map((p) => ({ email: p.orgMember.user.email }))
          .filter((a) => a.email);

        const googleEvent = await googleService.createEvent(creator.user.id, {
          summary: meeting.title,
          description: meeting.description || "",
          start: meeting.startTime.toISOString(),
          end: meeting.endTime.toISOString(),
          conferenceData:
            meeting.mode === "ONLINE"
              ? {
                  createRequest: {
                    requestId: `${meetingId}-${Date.now()}`,
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
            where: { id: meetingId },
            data: {
              meetingLink: meetLink,
              googleEventId: googleEvent.id || meetingId,
            },
          });
        }
      }
    } catch (syncError) {
      console.error(
        `[meetingService] Failed to sync accepted meeting to Google Calendar:`,
        syncError,
      );
    }

    return updatedMeeting;
  },

  /**
   * Decline meeting request
   */
  async declineMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterMemberId, reason } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Validate requester is a participant
    const requesterParticipant = meeting.participants.find(
      (p) => p.orgMemberId === requesterMemberId,
    );

    if (!requesterParticipant) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    // Allow declining only CREATED meetings
    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be declined",
      );
    }

    // Update meeting in transaction - only update participant response, not meeting status
    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        // Update only the participant response
        await tx.meetingParticipant.update({
          where: {
            meetingId_orgMemberId: {
              meetingId,
              orgMemberId: requesterMemberId,
            },
          },
          data: {
            responseStatus: "DECLINED",
            respondedAt: new Date(),
          },
        });

        // Fetch the updated meeting with all relations
        const updated = await tx.meeting.findUnique({
          where: { id: meetingId },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });

        if (!updated) {
          throw ErrorFactory.notFound("Meeting not found");
        }

        return updated;
      },
      { timeout: 15000 },
    );

    return updatedMeeting;
  },

  /**
   * Cancel meeting
   */
  async cancelMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterMemberId, reason } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Validate requester is a participant
    const requesterParticipant = meeting.participants.find(
      (p) => p.orgMemberId === requesterMemberId,
    );

    if (!requesterParticipant) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    // Update meeting in transaction
    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.meeting.update({
          where: { id: meetingId },
          data: {
            status: MeetingStatus.CANCELLED,
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: requesterMemberId,
          },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });

        // Create state history
        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: meeting.status,
            toStatus: MeetingStatus.CANCELLED,
            changedById: requesterMemberId,
            reason: reason || "Meeting cancelled",
          },
        });

        return updated;
      },
      { timeout: 15000 },
    );

    // Delete from Google Calendar (non-blocking)
    if (meeting.googleEventId) {
      try {
        const creator = await prisma.organizationMember.findUnique({
          where: { id: meeting.createdById },
          include: { user: true },
        });

        if (creator?.user.id) {
          await googleService.deleteEvent(
            creator.user.id,
            meeting.googleEventId,
          );
        }
      } catch (deleteError) {
        console.error(
          `[meetingService] Failed to delete meeting from Google Calendar:`,
          deleteError,
        );
      }
    }

    return updatedMeeting;
  },

  /**
   * Mark meeting as completed
   */
  async completeMeeting(data: UpdateMeetingStatusDTO): Promise<Meeting> {
    const { meetingId, requesterMemberId } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Only consultant can mark as complete
    const requesterParticipant = meeting.participants.find(
      (p) => p.orgMemberId === requesterMemberId,
    );

    if (
      !requesterParticipant ||
      requesterParticipant.participantType !== "ORGANIZER"
    ) {
      throw ErrorFactory.forbidden(
        "Only the consultant can mark meeting as completed",
      );
    }

    // Meeting must be in CREATED status to be completed
    if (meeting.status !== MeetingStatus.CREATED) {
      throw ErrorFactory.conflict(
        "Only meetings in CREATED status can be marked as completed",
      );
    }

    // Check if all attendees have accepted
    const pendingAttendees = meeting.participants.filter(
      (p) => p.participantType === "ATTENDEE" && p.responseStatus !== "ACCEPTED",
    );

    if (pendingAttendees.length > 0) {
      throw ErrorFactory.conflict(
        `Cannot complete meeting: ${pendingAttendees.length} attendee(s) have not yet accepted the meeting invitation`,
      );
    }

    // Update meeting
    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.meeting.update({
          where: { id: meetingId },
          data: { status: MeetingStatus.COMPLETED },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });

        if (!updated) {
          throw ErrorFactory.notFound("Meeting not found");
        }

        // Create state history
        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: MeetingStatus.CREATED,
            toStatus: MeetingStatus.COMPLETED,
            changedById: requesterMemberId,
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
      requestedByMemberId,
      reason,
    } = data;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });

    if (!meeting) {
      throw ErrorFactory.notFound("Meeting");
    }

    // Validate requester is participant
    const requester = meeting.participants.find(
      (p) => p.orgMemberId === requestedByMemberId,
    );
    if (!requester) {
      throw ErrorFactory.forbidden("You are not a participant in this meeting");
    }

    if (proposedStartTime >= proposedEndTime) {
      throw ErrorFactory.validation(
        "Proposed start time must be before end time",
      );
    }

    // Create reschedule request
    const rescheduleRequest = await prisma.$transaction(
      async (tx) => {
        const request = await tx.meetingRescheduleRequest.create({
          data: {
            meetingId,
            requestedById: requestedByMemberId,
            proposedStartTime,
            proposedEndTime,
            reason,
            status: "PENDING",
          },
        });

        // Update meeting status
        await tx.meeting.update({
          where: { id: meetingId },
          data: { status: MeetingStatus.RESCHEDULING_REQUESTED },
        });

        // Create state history
        await tx.meetingStateHistory.create({
          data: {
            meetingId,
            fromStatus: meeting.status,
            toStatus: MeetingStatus.RESCHEDULING_REQUESTED,
            changedById: requestedByMemberId,
            reason: reason || "Reschedule requested",
          },
        });

        return request;
      },
      { timeout: 15000 },
    );

    return rescheduleRequest;
  },

  /**
   * Respond to reschedule request
   */
  async respondToReschedule(data: RespondToRescheduleDTO): Promise<Meeting> {
    const {
      rescheduleRequestId,
      respondedByMemberId,
      accepted,
      responseNotes,
    } = data;

    const rescheduleRequest = await prisma.meetingRescheduleRequest.findUnique({
      where: { id: rescheduleRequestId },
      include: { meeting: { include: { participants: true } } },
    });

    if (!rescheduleRequest) {
      throw ErrorFactory.notFound("Reschedule request");
    }

    const meeting = rescheduleRequest.meeting;

    // Validate responder is the OTHER participant
    const responder = meeting.participants.find(
      (p) => p.orgMemberId === respondedByMemberId,
    );
    if (!responder || rescheduleRequest.requestedById === respondedByMemberId) {
      throw ErrorFactory.forbidden(
        "Only the other participant can respond to this reschedule",
      );
    }

    // Update in transaction
    const updatedMeeting = await prisma.$transaction(
      async (tx) => {
        let updated = meeting;

        if (accepted) {
          // Check for conflicts at new time
          const conflicts = await this.detectConflicts({
            orgMemberId: meeting.createdById,
            startTime: rescheduleRequest.proposedStartTime,
            endTime: rescheduleRequest.proposedEndTime,
            excludeMeetingId: meeting.id,
          });

          if (conflicts.length > 0) {
            throw ErrorFactory.conflict("Proposed time has conflicts");
          }

          // Update meeting with new times
          updated = await tx.meeting.update({
            where: { id: meeting.id },
            data: {
              startTime: rescheduleRequest.proposedStartTime,
              endTime: rescheduleRequest.proposedEndTime,
              status: MeetingStatus.CREATED,
            },
            include: { participants: true },
          });

          // Update Google Calendar
          if (meeting.googleEventId) {
            const creator = await prisma.organizationMember.findUnique({
              where: { id: meeting.createdById },
              include: { user: true },
            });

            if (creator?.user.id) {
              try {
                await googleService.updateEvent(
                  creator.user.id,
                  meeting.googleEventId,
                  {
                    summary: meeting.title,
                    description: meeting.description,
                    start: {
                      dateTime:
                        rescheduleRequest.proposedStartTime.toISOString(),
                    },
                    end: {
                      dateTime: rescheduleRequest.proposedEndTime.toISOString(),
                    },
                  },
                );
              } catch (updateError) {
                console.error(
                  `[meetingService] Failed to update Google Calendar:`,
                  updateError,
                );
              }
            }
          }
        } else {
          // Decline: meeting goes back to CREATED status
          updated = await tx.meeting.update({
            where: { id: meeting.id },
            data: { status: MeetingStatus.CREATED },
            include: { participants: true },
          });
        }

        // Update reschedule request
        await tx.meetingRescheduleRequest.update({
          where: { id: rescheduleRequestId },
          data: {
            status: accepted ? "ACCEPTED" : "DECLINED",
            respondedById: respondedByMemberId,
            respondedAt: new Date(),
            responseNotes,
          },
        });

        // Create state history
        await tx.meetingStateHistory.create({
          data: {
            meetingId: meeting.id,
            fromStatus: MeetingStatus.RESCHEDULING_REQUESTED,
            toStatus: accepted ? MeetingStatus.CREATED : MeetingStatus.CREATED,
            changedById: respondedByMemberId,
            reason: accepted
              ? `Reschedule accepted - meeting rescheduled`
              : `Reschedule declined - meeting stays original time`,
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
    const rescheduleRequests = await prisma.meetingRescheduleRequest.findMany({
      where: {
        meetingId,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with requester details
    const enriched = await Promise.all(
      rescheduleRequests.map(async (request) => {
        const requester = await prisma.organizationMember.findUnique({
          where: { id: request.requestedById },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return {
          ...request,
          requestedBy: requester,
        };
      }),
    );

    return enriched;
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

    // Update guest response status
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
    orgMemberId: string;
    status?: MeetingStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<(Meeting & { participants: MeetingParticipant[] })[]> {
    const {
      orgMemberId,
      status,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
    } = params;

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      participants: {
        some: {
          orgMemberId,
        },
      },
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        (where.startTime as any).gte = startDate;
      }
      if (endDate) {
        (where.startTime as any).lte = endDate;
      }
    }

    return prisma.meeting.findMany({
      where,
      include: {
        participants: {
          include: {
            orgMember: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { startTime: "asc" },
      take: limit,
      skip: offset,
    });
  },

  /**
   * Get meetings without pagination (max 1000 results for calendar view)
   */
  async getMeetingsWithoutPagination(params: {
    orgMemberId: string;
    status?: MeetingStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<(Meeting & { participants: MeetingParticipant[] })[]> {
    const { orgMemberId, status, startDate, endDate } = params;

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      participants: {
        some: {
          orgMemberId,
        },
      },
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        (where.startTime as any).gte = startDate;
      }
      if (endDate) {
        (where.startTime as any).lte = endDate;
      }
    }

    return prisma.meeting.findMany({
      where,
      include: {
        participants: {
          include: {
            orgMember: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { startTime: "asc" },
      take: 1000,
    });
  },

  /**
   * Detect conflicts for a time slot
   */
  async detectConflicts(params: ConflictDetectionParams): Promise<any[]> {
    const { orgMemberId, startTime, endTime, excludeMeetingId } = params;

    const conflicts = [];

    // Check overlapping meetings - only CREATED meetings can have conflicts
    const meetings = await prisma.meeting.findMany({
      where: {
        isDeleted: false,
        id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
        status: MeetingStatus.CREATED,
        participants: {
          some: {
            orgMemberId: orgMemberId,
          },
        },
        OR: [
          {
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        ],
      },
      include: {
        participants: {
          include: {
            orgMember: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    for (const meeting of meetings) {
      conflicts.push({
        type: "MEETING",
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        details: `Meeting "${meeting.title}" scheduled from ${meeting.startTime.toLocaleTimeString()} to ${meeting.endTime.toLocaleTimeString()}`,
      });
    }

    // Check blocked times (including recurring)
    const blockedTimes = await prisma.memberBlockedTime.findMany({
      where: {
        orgMemberId: orgMemberId,
        isActive: true,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    for (const blocked of blockedTimes) {
      // Check if recurring
      if (blocked.recurrenceRule !== "NONE") {
        const recurringBlocks = this.calculateRecurringBlocks(
          blocked,
          startTime,
          endTime,
        );
        for (const [blockStart, blockEnd] of recurringBlocks) {
          if (blockStart < endTime && blockEnd > startTime) {
            conflicts.push({
              type: "BLOCKED_TIME",
              startTime: blockStart,
              endTime: blockEnd,
              details: `Blocked time: ${blocked.reason || "Unavailable"}`,
            });
          }
        }
      } else {
        conflicts.push({
          type: "BLOCKED_TIME",
          startTime: blocked.startTime,
          endTime: blocked.endTime,
          details: `Blocked time: ${blocked.reason || "Unavailable"}`,
        });
      }
    }

    return conflicts;
  },

  /**
   * Calculate recurring blocked time instances
   */
  calculateRecurringBlocks(
    blockedTime: any,
    checkStart: Date,
    checkEnd: Date,
  ): Array<[Date, Date]> {
    if (blockedTime.recurrenceRule === "NONE") {
      return [[blockedTime.startTime, blockedTime.endTime]];
    }

    const blocks: Array<[Date, Date]> = [];
    let current = new Date(blockedTime.startTime);
    const duration =
      blockedTime.endTime.getTime() - blockedTime.startTime.getTime();
    const recurrenceEnd = blockedTime.recurrenceEnd || checkEnd;

    while (current <= recurrenceEnd) {
      if (current >= checkStart && current <= checkEnd) {
        blocks.push([current, new Date(current.getTime() + duration)]);
      }

      if (blockedTime.recurrenceRule === "WEEKLY") {
        current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (blockedTime.recurrenceRule === "MONTHLY") {
        current = new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          current.getDate(),
        );
      }

      if (current > recurrenceEnd) break;
    }

    return blocks;
  },

  /**
   * Get consultant profile and available slots for public booking (no auth required)
   */
  async getPublicBookingProfile(shareToken: string): Promise<{
    consultant: {
      id: string;
      name: string;
      email: string;
      title?: string;
    };
    availableSlots: Array<{
      date: string;
      slots: Array<{ startTime: string; endTime: string }>;
    }>;
  }> {
    // Find member by share token
    const member = await prisma.organizationMember.findFirst({
      where: { shareToken: shareToken as any },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!member) {
      throw ErrorFactory.notFound("Booking link not found or disabled");
    }

    // Get available slots for next 30 days
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);

    const slots = await availabilityService.getAvailableSlots(
      member.id,
      today,
      endDate,
      30,
    );

    // Group slots by date
    const slotsByDate: Record<
      string,
      Array<{ startTime: string; endTime: string }>
    > = {};
    slots.forEach((slot) => {
      const dateKey = slot.start.toISOString().split("T")[0];
      if (!slotsByDate[dateKey]) {
        slotsByDate[dateKey] = [];
      }
      slotsByDate[dateKey].push({
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
      });
    });

    // Convert to expected format
    const availableSlots = Object.entries(slotsByDate).map(([date, slots]) => ({
      date,
      slots,
    }));

    return {
      consultant: {
        id: member.id,
        name: member.user.name,
        email: member.user.email,
      },
      availableSlots,
    };
  },

  /**
   * Request meeting from public booking link (no auth required)
   */
  async requestMeetingPublic(data: {
    shareToken: string;
    guestEmail: string;
    guestName: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    mode: "ONLINE" | "IN_PERSON";
    location?: string;
    guestMessage?: string;
  }): Promise<Meeting> {
    const {
      shareToken,
      guestEmail,
      guestName,
      title,
      description,
      startTime,
      endTime,
      timezone,
      mode,
      location,
      guestMessage,
    } = data;

    // Validate time range
    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Find consultant by share token
    const consultant = await prisma.organizationMember.findFirst({
      where: { shareToken: shareToken as any },
    });

    if (!consultant) {
      throw ErrorFactory.notFound("Booking link not found or disabled");
    }

    // Validate consultant is active
    const consultantUser = await prisma.user.findUnique({
      where: { id: consultant.userId },
    });

    if (!consultantUser?.isActive) {
      throw ErrorFactory.notFound("Consultant not available");
    }

    // Check for conflicts for the consultant
    const conflicts = await this.detectConflicts({
      orgMemberId: consultant.id,
      startTime,
      endTime,
    });

    if (conflicts.length > 0) {
      throw ErrorFactory.conflict(
        `Requested time slot is not available. Please choose another time.`,
      );
    }

    // Create meeting in transaction (CREATED status)
    const meeting = await prisma.$transaction(
      async (tx) => {
        // Build meeting data - handle guest fields gracefully
        const meetingData: any = {
          title,
          description,
          startTime,
          endTime,
          timezone,
          mode: mode as "ONLINE" | "IN_PERSON",
          status: MeetingStatus.CREATED,
          location,
          createdById: consultant.id,
          createdByRole: UserRoleEnum.MEMBER,
          organizationId: consultant.orgId,
        };

        // Add guest fields
        meetingData.guestEmail = guestEmail;
        meetingData.guestName = guestName;
        if (guestMessage) meetingData.guestMessage = guestMessage;

        const newMeeting = await tx.meeting.create({ data: meetingData });

        // Add consultant as organizer (ACCEPTED)
        await tx.meetingParticipant.create({
          data: {
            meetingId: newMeeting.id,
            orgMemberId: consultant.id,
            participantType: "ORGANIZER",
            responseStatus: "ACCEPTED",
            respondedAt: new Date(),
          },
        });

        // Re-fetch with relations
        const finalMeeting = await tx.meeting.findUnique({
          where: { id: newMeeting.id },
          include: {
            participants: {
              include: {
                orgMember: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            stateHistory: true,
          },
        });

        return finalMeeting;
      },
      { timeout: 15000 },
    );

    if (!meeting) {
      throw ErrorFactory.validation("Failed to create meeting request");
    }

    // Sync to Google Calendar (non-blocking)
    try {
      const googleEvent = await googleService.createEvent(consultantUser.id, {
        summary: title,
        description: `Guest: ${guestName} (${guestEmail})\n\n${description || ""}\n\n${guestMessage ? `Message: ${guestMessage}` : ""}`,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        conferenceData:
          mode === "ONLINE"
            ? {
                createRequest: {
                  requestId: `${meeting.id}-${Date.now()}`,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              }
            : undefined,
        attendees: [{ email: guestEmail }],
      });

      // Update meeting with Google event ID and link
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
        `[meetingService] Failed to sync public booking to Google Calendar:`,
        syncError,
      );
      // Non-blocking: don't fail meeting creation if sync fails
    }

    return meeting;
  },

  /**
   * Generate or regenerate public booking share token for a consultant
   */
  async generateShareToken(orgMemberId: string): Promise<string> {
    // Generate unique token
    const shareToken = randomUUID();

    // Update member with token
    await prisma.organizationMember.update({
      where: { id: orgMemberId },
      data: {
        shareToken: shareToken as any,
        isPublicBookingEnabled: true as any,
      },
    });

    return shareToken;
  },

  /**
   * Disable public booking for a consultant
   */
  async disablePublicBooking(orgMemberId: string): Promise<void> {
    await prisma.organizationMember.update({
      where: { id: orgMemberId },
      data: {
        isPublicBookingEnabled: false as any,
        shareToken: null as any,
      },
    });
  },

  /**
   * Get public booking status for a consultant
   */
  async getPublicBookingStatus(orgMemberId: string): Promise<{
    isEnabled: boolean;
    shareToken: string | null;
    publicLink: string | null;
  }> {
    const member = await prisma.organizationMember.findUnique({
      where: { id: orgMemberId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Member not found");
    }

    const shareToken = (member as any).shareToken;
    const isPublicBookingEnabled = (member as any).isPublicBookingEnabled;

    const publicLink = shareToken
      ? `${process.env.PUBLIC_URL || "http://localhost:3000"}/public/booking/${shareToken}`
      : null;

    return {
      isEnabled: isPublicBookingEnabled || false,
      shareToken: shareToken || null,
      publicLink,
    };
  },
};
