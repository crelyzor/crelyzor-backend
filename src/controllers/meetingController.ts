import { Request, Response } from "express";
import { MeetingStatus, MeetingType } from "@prisma/client";
import { TokenPayload } from "../types/authTypes";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { meetingService } from "../services/meetings/meetingService";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { getTeamContext } from "../middleware/teamContext";
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
      const parsed = createMeetingSchema.safeParse(req.body);
      if (!parsed.success) throw ErrorFactory.validation("Validation failed");
      const validatedData = parsed.data;

      const { meeting, gcalSynced } = await meetingService.createMeeting(
        { createdById: user.userId, ...validatedData },
        getTeamContext(req),
      );

      apiResponse(res, {
        statusCode: 201,
        message: "Meeting created successfully",
        data: { meeting, gcalSynced },
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async updateMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);
      const parsedUpdate = updateMeetingSchema.safeParse(req.body);
      if (!parsedUpdate.success)
        throw ErrorFactory.validation("Validation failed");
      const validatedData = parsedUpdate.data;

      const meeting = await meetingService.updateMeeting(
        meetingId,
        user.userId,
        validatedData,
        getTeamContext(req),
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting updated successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async cancelMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);
      const parsedAction = meetingActionSchema.safeParse(req.body);
      if (!parsedAction.success)
        throw ErrorFactory.validation("Validation failed");
      const validatedData = parsedAction.data;

      const meeting = await meetingService.cancelMeeting(
        {
          meetingId,
          newStatus: MeetingStatus.CANCELLED,
          requesterUserId: user.userId,
          reason: validatedData.reason,
        },
        getTeamContext(req),
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting cancelled successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async completeMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);

      const meeting = await meetingService.completeMeeting(
        {
          meetingId,
          newStatus: MeetingStatus.COMPLETED,
          requesterUserId: user.userId,
        },
        getTeamContext(req),
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting marked as completed",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async getMeetings(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const parsedQuery = getMeetingsSchema.safeParse(req.query);
      if (!parsedQuery.success)
        throw ErrorFactory.validation("Validation failed");
      const validatedData = parsedQuery.data;

      const { meetings, total } = await meetingService.getMeetings({
        userId: user.userId,
        status: validatedData.status as MeetingStatus | undefined,
        type: validatedData.type as MeetingType | undefined,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        limit: validatedData.limit,
        offset: validatedData.offset,
        teamContext: getTeamContext(req),
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meetings retrieved successfully",
        data: {
          meetings,
          pagination: {
            count: meetings.length,
            total,
            limit: validatedData.limit,
            offset: validatedData.offset,
          },
        },
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async getMeetingsWithoutPagination(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const parsedNoPag = getMeetingsWithoutPaginationSchema.safeParse(
        req.query,
      );
      if (!parsedNoPag.success)
        throw ErrorFactory.validation("Validation failed");
      const validatedData = parsedNoPag.data;

      const { meetings, truncated } =
        await meetingService.getMeetingsWithoutPagination({
          userId: user.userId,
          status: validatedData.status as MeetingStatus | undefined,
          type: validatedData.type as MeetingType | undefined,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          teamContext: getTeamContext(req),
        });

      apiResponse(res, {
        statusCode: 200,
        message: truncated
          ? "Meetings retrieved (showing first 200 — apply a date range to see all)"
          : "Meetings retrieved successfully",
        data: { meetings, truncated },
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async getMeetingById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);
      const teamContext = getTeamContext(req);

      // Phase 6 P5.1.a — fetch by id with a minimal projection first so
      // verifyMeetingAccess (in meetingService) can run on the slim row;
      // refetch with the full include only when the caller is allowed.
      // The two-step pattern avoids any chance of leaking a full payload
      // on a cross-team probe.
      const slim = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: {
          id: true,
          createdById: true,
          teamId: true,
          isDeleted: true,
          participants: { select: { userId: true } },
        },
      });

      if (!slim) {
        throw new AppError("Meeting not found", 404);
      }

      // Inline access check — same rules as verifyMeetingAccess.
      // Pulled inline (instead of calling the service helper) only because
      // the service helper is not yet exported; P5.1.b will lift this into
      // a single shared getMeetingById service method.
      const isCreator = slim.createdById === user.userId;
      const isParticipant = slim.participants.some(
        (p) => p.userId === user.userId,
      );
      const allowedRead = (() => {
        if (slim.isDeleted) return false;
        if (!teamContext) {
          return slim.teamId === null && (isCreator || isParticipant);
        }
        if (slim.teamId !== teamContext.teamId) return false;
        if (teamContext.role === "MEMBER") return isCreator || isParticipant;
        return true; // ADMIN / OWNER
      })();

      if (!allowedRead) {
        throw new AppError("Meeting not found", 404);
      }

      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          team: { select: { id: true, name: true, slug: true } },
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
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
          tags: {
            include: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting details retrieved successfully",
        data: meeting,
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async deleteMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const meetingId = parseMeetingId(req.params.meetingId);

      await meetingService.deleteMeeting(
        meetingId,
        user.userId,
        getTeamContext(req),
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Meeting deleted successfully",
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }

  async importIcs(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;

      if (!req.file?.buffer) {
        throw ErrorFactory.validation("ICS file is required");
      }

      const result = await meetingService.importMeetingsFromIcs(
        user.userId,
        req.file.buffer,
        getTeamContext(req),
      );

      apiResponse(res, {
        statusCode: 200,
        message: "ICS import completed",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(
        error instanceof Error ? error : new Error(String(error)),
        req,
        res,
      );
    }
  }
}

export const meetingController = new MeetingController();
