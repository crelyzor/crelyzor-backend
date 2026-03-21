import { Request, Response } from "express";
import { MeetingStatus, MeetingType } from "@prisma/client";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseMeetingId(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    throw ErrorFactory.notFound("Meeting");
  }
  return raw;
}

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
      const meetingId = parseMeetingId(req.params.meetingId);
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
      const meetingId = parseMeetingId(req.params.meetingId);
      const validatedData = meetingActionSchema.parse(req.body);

      const meeting = await meetingService.cancelMeeting({
        meetingId,
        newStatus: MeetingStatus.CANCELLED,
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
      const meetingId = parseMeetingId(req.params.meetingId);

      const meeting = await meetingService.completeMeeting({
        meetingId,
        newStatus: MeetingStatus.COMPLETED,
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
        status: validatedData.status as MeetingStatus | undefined,
        type: validatedData.type as MeetingType | undefined,
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

      const { meetings, truncated } =
        await meetingService.getMeetingsWithoutPagination({
          userId: user.userId,
          status: validatedData.status as MeetingStatus | undefined,
          type: validatedData.type as MeetingType | undefined,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
        });

      apiResponse(res, {
        statusCode: 200,
        message: truncated
          ? "Meetings retrieved (showing first 200 — apply a date range to see all)"
          : "Meetings retrieved successfully",
        data: { meetings, truncated },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async getMeetingById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);

      const meeting = await prisma.meeting.findFirst({
        where: {
          id: meetingId,
          isDeleted: false,
          OR: [
            { createdById: user.userId },
            { participants: { some: { userId: user.userId } } },
          ],
        },
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

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting details retrieved successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async deleteMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);

      const result = await prisma.meeting.updateMany({
        where: { id: meetingId, isDeleted: false, createdById: user.userId },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.userId },
      });

      if (result.count === 0) {
        throw ErrorFactory.notFound("Meeting");
      }

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting deleted successfully",
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const meetingController = new MeetingController();
