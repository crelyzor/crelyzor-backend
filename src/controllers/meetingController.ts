import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
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
   * Create meeting (user-level)
   */
  async createMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const validatedData = createMeetingSchema.parse(req.body);

      const meeting = await meetingService.createMeeting({
        createdById: user.userId,
        ...validatedData,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Meeting created successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Update meeting details
   */
  async updateMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = req.params.meetingId as string;
      const validatedData = updateMeetingSchema.parse(req.body);

      const meeting = await meetingService.updateMeeting(
        meetingId,
        user.userId,
        validatedData,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting updated successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Request meeting from another user
   */
  async requestMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const validatedData = requestMeetingSchema.parse(req.body);

      const meeting = await meetingService.requestMeeting({
        ...validatedData,
        createdById: user.userId,
        targetUserId: validatedData.targetUserId,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Meeting request created successfully",
        data: meeting,
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
      const meetingId = req.params.meetingId as string;
      const validatedData = meetingActionSchema.parse(req.body);

      const meeting = await meetingService.acceptMeeting({
        meetingId,
        newStatus: "ACCEPTED" as any,
        requesterUserId: user.userId,
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
      const meetingId = req.params.meetingId as string;
      const validatedData = meetingActionSchema.parse(req.body);

      const meeting = await meetingService.declineMeeting({
        meetingId,
        newStatus: "DECLINED" as any,
        requesterUserId: user.userId,
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
      const meetingId = req.params.meetingId as string;
      const validatedData = meetingActionSchema.parse(req.body);

      const meeting = await meetingService.cancelMeeting({
        meetingId,
        newStatus: "CANCELLED" as any,
        requesterUserId: user.userId,
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
      const meetingId = req.params.meetingId as string;

      const meeting = await meetingService.completeMeeting({
        meetingId,
        newStatus: "COMPLETED" as any,
        requesterUserId: user.userId,
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
      const meetingId = req.params.meetingId as string;
      const validatedData = proposeMeetingRescheduleSchema.parse(req.body);

      const rescheduleRequest = await meetingService.proposeReschedule({
        meetingId,
        proposedStartTime: validatedData.proposedStartTime,
        proposedEndTime: validatedData.proposedEndTime,
        requestedByUserId: user.userId,
        reason: validatedData.reason,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Reschedule proposal created successfully",
        data: rescheduleRequest,
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
      const meetingId = req.params.meetingId as string;
      const guestEmail = req.params.guestEmail as string;

      if (!meetingId || !guestEmail) {
        throw ErrorFactory.validation(
          "Meeting ID and guest email are required",
        );
      }

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
      const meetingId = req.params.meetingId as string;

      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: { participants: true },
      });

      if (!meeting) {
        throw ErrorFactory.notFound("Meeting");
      }

      const isParticipant = meeting.participants.some(
        (p) => p.userId === user.userId,
      );

      if (!isParticipant) {
        throw ErrorFactory.forbidden(
          "You are not a participant in this meeting",
        );
      }

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
      const requestId = req.params.requestId as string;
      const validatedData = respondToRescheduleSchema.parse(req.body);

      const meeting = await meetingService.respondToReschedule({
        rescheduleRequestId: requestId,
        respondedByUserId: user.userId,
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
      const validatedData = getMeetingsSchema.parse(req.query);

      const meetings = await meetingService.getMeetings({
        userId: user.userId,
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
      const validatedData = getMeetingsWithoutPaginationSchema.parse(req.query);

      const meetings = await meetingService.getMeetingsWithoutPagination({
        userId: user.userId,
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
      const meetingId = req.params.meetingId as string;

      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
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
          stateHistory: true,
          rescheduleRequests: true,
          guests: true,
          eventType: {
            select: { id: true, title: true, slug: true, duration: true },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      if (!meeting) {
        throw ErrorFactory.notFound("Meeting");
      }

      const isParticipant =
        meeting.createdById === user.userId ||
        meeting.participants.some((p) => p.userId === user.userId);

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
}

export const meetingController = new MeetingController();
