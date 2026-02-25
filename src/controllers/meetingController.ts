import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { meetingService } from "../services/meetings/meetingService";
import prisma from "../db/prismaClient";
import {
  createMeetingSchema,
  meetingActionSchema,
  getMeetingsSchema,
  getMeetingsWithoutPaginationSchema,
  updateMeetingSchema,
} from "../validators/meetingSchema";

export class MeetingController {
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
