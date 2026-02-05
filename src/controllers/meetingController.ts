import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { orgPayload } from "../types/orgTypes";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { meetingService } from "../services/meetings/meetingService";
import prisma from "../db/prismaClient";
import {
  createMeetingSchema,
  requestMeetingSchema,
  meetingActionSchema,
  proposeMeetingRescheduleSchema,
  respondToRescheduleSchema,
  getMeetingsSchema,
  getMeetingsWithoutPaginationSchema,
  updateMeetingSchema,
} from "../validators/meetingSchema";

export class MeetingController {
  /**
   * Consultant creates meeting with assigned students (auto-accepted)
   */
  async createMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = createMeetingSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Verify only OWNER/ADMIN/MEMBER can create meetings
      const allowedRoles = ["OWNER", "ADMIN", "MEMBER"];
      if (!allowedRoles.includes(orgMember.role.roleName || "")) {
        throw ErrorFactory.forbidden(
          "Only organization members can create meetings.",
        );
      }

      // Create meeting
      const meeting = await meetingService.createMeetingByConsultant({
        organizationId: org.orgId,
        createdById: orgMember.orgMemberId,
        createdByRole: orgMember.role.roleName,
        ...validatedData,
      });

      // Exclude async-populated fields from immediate response (will be populated async)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { meetingLink, googleEventId, recordingLink, ...meetingData } =
        meeting;

      apiResponse(res, {
        statusCode: 201,
        message: "Meeting created successfully",
        data: meetingData,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Update meeting details (title, description, time, participants, etc.)
   */
  async updateMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Validate input
      const validatedData = updateMeetingSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Update meeting
      const meeting = await meetingService.updateMeeting(
        meetingId,
        orgMember.orgMemberId,
        validatedData,
      );

      // Exclude async-populated fields from immediate response
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { meetingLink, googleEventId, recordingLink, ...meetingData } =
        meeting;

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting updated successfully",
        data: meetingData,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Student requests meeting from consultant (pending acceptance)
   */
  async requestMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = requestMeetingSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Any member can request a meeting
      // Request meeting
      const meeting = await meetingService.requestMeetingByMember({
        organizationId: org.orgId,
        createdById: orgMember.orgMemberId,
        createdByRole: orgMember.role.roleName,
        ...validatedData,
      });

      // Exclude async-populated fields from immediate response (will be populated async)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { meetingLink, googleEventId, recordingLink, ...meetingData } =
        meeting;

      apiResponse(res, {
        statusCode: 201,
        message: "Meeting request created successfully",
        data: meetingData,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Accept meeting request
   */
  async acceptMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Validate input
      const validatedData = meetingActionSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Accept meeting
      const meeting = await meetingService.acceptMeeting({
        meetingId,
        newStatus: "ACCEPTED" as any,
        requesterMemberId: orgMember.orgMemberId,
        reason: validatedData.reason,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting accepted successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Decline meeting request
   */
  async declineMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Validate input
      const validatedData = meetingActionSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Decline meeting
      const meeting = await meetingService.declineMeeting({
        meetingId,
        newStatus: "DECLINED" as any,
        requesterMemberId: orgMember.orgMemberId,
        reason: validatedData.reason,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting declined successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Cancel meeting
   */
  async cancelMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Validate input
      const validatedData = meetingActionSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Cancel meeting
      const meeting = await meetingService.cancelMeeting({
        meetingId,
        newStatus: "CANCELLED" as any,
        requesterMemberId: orgMember.orgMemberId,
        reason: validatedData.reason,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting cancelled successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Mark meeting as completed
   */
  async completeMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Complete meeting
      const meeting = await meetingService.completeMeeting({
        meetingId,
        newStatus: "COMPLETED" as any,
        requesterMemberId: orgMember.orgMemberId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting marked as completed",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Propose meeting reschedule
   */
  async proposeReschedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Validate input
      const validatedData = proposeMeetingRescheduleSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Propose reschedule
      const rescheduleRequest = await meetingService.proposeReschedule({
        meetingId,
        proposedStartTime: validatedData.proposedStartTime,
        proposedEndTime: validatedData.proposedEndTime,
        requestedByMemberId: orgMember.orgMemberId,
        reason: validatedData.reason,
      });

      // Get updated meeting with all reschedule details
      const updatedMeeting = await prisma.meeting.findUnique({
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
          rescheduleRequests: true,
          createdByMember: {
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
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Reschedule proposal created successfully",
        data: {
          rescheduleRequest,
          meeting: updatedMeeting,
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Guest responds to meeting invitation
   */
  async respondToGuestInvitation(req: Request, res: Response): Promise<void> {
    try {
      const { meetingId, guestEmail } = req.params;

      if (!meetingId || !guestEmail) {
        throw ErrorFactory.validation(
          "Meeting ID and guest email are required",
        );
      }

      // Determine if accept or decline based on the route path
      const isAccepted = req.path.includes("/accept");

      const result = await meetingService.respondToGuestInvitation(
        meetingId,
        guestEmail,
        isAccepted,
      );

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get reschedule requests for a meeting
   */
  async getRescheduleRequests(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Get meeting to verify user is a participant
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: { participants: true },
      });

      if (!meeting) {
        throw ErrorFactory.notFound("Meeting");
      }

      // Verify user is a participant
      const isParticipant = meeting.participants.some(
        (p) => p.orgMemberId === orgMember.orgMemberId,
      );

      if (!isParticipant) {
        throw ErrorFactory.forbidden(
          "You are not a participant in this meeting",
        );
      }

      // Get reschedule requests
      const rescheduleRequests =
        await meetingService.getRescheduleRequests(meetingId);

      apiResponse(res, {
        statusCode: 200,
        message: "Reschedule requests retrieved successfully",
        data: rescheduleRequests,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Respond to reschedule request
   */
  async respondToReschedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId, requestId } = req.params;

      // Validate input
      const validatedData = respondToRescheduleSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Respond to reschedule
      const meeting = await meetingService.respondToReschedule({
        rescheduleRequestId: requestId,
        respondedByMemberId: orgMember.orgMemberId,
        accepted: validatedData.accepted,
        responseNotes: validatedData.responseNotes,
      });

      apiResponse(res, {
        statusCode: 200,
        message: validatedData.accepted
          ? "Reschedule accepted"
          : "Reschedule declined",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get meetings with filters
   */
  async getMeetings(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = getMeetingsSchema.parse(req.query);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Get meetings
      const meetings = await meetingService.getMeetings({
        orgMemberId: orgMember.orgMemberId,
        status: validatedData.status as any,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        limit: validatedData.limit,
        offset: validatedData.offset,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meetings retrieved successfully",
        data: {
          meetings,
          pagination: {
            count: meetings.length,
            limit: validatedData.limit,
            offset: validatedData.offset,
          },
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get meetings without pagination (for calendar view)
   */
  async getMeetingsWithoutPagination(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = getMeetingsWithoutPaginationSchema.parse(req.query);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Get meetings
      const meetings = await meetingService.getMeetingsWithoutPagination({
        orgMemberId: orgMember.orgMemberId,
        status: validatedData.status as any,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meetings retrieved successfully",
        data: meetings,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get single meeting details
   */
  async getMeetingById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { meetingId } = req.params;

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Get meeting
      const meeting = await prisma.meeting.findUnique({
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
          rescheduleRequests: true,
          createdByMember: {
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
      });

      if (!meeting) {
        throw ErrorFactory.notFound("Meeting");
      }

      // Verify user is a participant
      const isParticipant = meeting.participants.some(
        (p: any) => p.orgMemberId === orgMember.orgMemberId,
      );

      if (!isParticipant) {
        throw ErrorFactory.forbidden(
          "You are not a participant in this meeting",
        );
      }

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting details retrieved successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get consultant profile and available slots for public booking (no auth required)
   */
  async getPublicBookingProfile(req: Request, res: Response): Promise<void> {
    try {
      const { shareToken } = req.params;

      if (!shareToken) {
        throw ErrorFactory.validation("Share token is required");
      }

      const profile = await meetingService.getPublicBookingProfile(shareToken);

      apiResponse(res, {
        statusCode: 200,
        message: "Booking profile retrieved successfully",
        data: profile,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Request meeting via public booking link (no auth required)
   */
  async requestMeetingPublic(req: Request, res: Response): Promise<void> {
    try {
      const { shareToken } = req.params;
      const {
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
      } = req.body;

      // Validate required fields
      if (!shareToken) {
        throw ErrorFactory.validation("Share token is required");
      }
      if (
        !guestEmail ||
        !guestName ||
        !title ||
        !startTime ||
        !endTime ||
        !timezone ||
        !mode
      ) {
        throw ErrorFactory.validation(
          "Missing required fields: guestEmail, guestName, title, startTime, endTime, timezone, mode",
        );
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        throw ErrorFactory.validation(
          "Invalid date format for startTime or endTime",
        );
      }

      const meeting = await meetingService.requestMeetingPublic({
        shareToken,
        guestEmail,
        guestName,
        title,
        description,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        timezone,
        mode: mode as "ONLINE" | "IN_PERSON",
        location,
        guestMessage,
      });

      apiResponse(res, {
        statusCode: 201,
        message:
          "Meeting request submitted successfully. The consultant will review and respond soon.",
        data: {
          id: meeting.id,
          title: meeting.title,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          guestEmail: (meeting as any).guestEmail,
          guestName: (meeting as any).guestName,
          status: meeting.status,
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Generate public booking link for consultant
   */
  async generatePublicLink(req: Request, res: Response): Promise<void> {
    try {
      const org = req.org as orgPayload;

      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Verify user is a consultant
      if (!["CONSULTANT", "ADMIN"].includes(orgMember.role.roleName || "")) {
        throw ErrorFactory.forbidden(
          "Only consultants can generate public booking links",
        );
      }

      await meetingService.generateShareToken(orgMember.orgMemberId);
      const bookingStatus = await meetingService.getPublicBookingStatus(
        orgMember.orgMemberId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Public booking link generated successfully",
        data: {
          isEnabled: bookingStatus.isEnabled,
          shareToken: bookingStatus.shareToken,
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get public booking status
   */
  async getPublicBookingStatusHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const org = req.org as orgPayload;

      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      const bookingStatus = await meetingService.getPublicBookingStatus(
        orgMember.orgMemberId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Public booking status retrieved successfully",
        data: {
          isEnabled: bookingStatus.isEnabled,
          shareToken: bookingStatus.shareToken,
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Disable public booking
   */
  async disablePublicBookingHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const org = req.org as orgPayload;

      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Verify user is a consultant
      if (!["CONSULTANT", "ADMIN"].includes(orgMember.role.roleName || "")) {
        throw ErrorFactory.forbidden(
          "Only consultants can manage public booking",
        );
      }

      await meetingService.disablePublicBooking(orgMember.orgMemberId);

      apiResponse(res, {
        statusCode: 200,
        message: "Public booking disabled successfully",
        data: {
          isEnabled: false,
          shareToken: null,
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const meetingController = new MeetingController();
