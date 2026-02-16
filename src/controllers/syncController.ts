import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { orgPayload } from "../types/orgTypes";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { googleCalendarSyncService } from "../services/googleCalendarSyncService";
import prisma from "../db/prismaClient";

export class SyncController {
  /**
   * Manually trigger Google Calendar sync
   * Syncs all events from user's Google Calendar to our database
   */
  async syncGoogleCalendar(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Perform sync
      const result = await googleCalendarSyncService.syncGoogleCalendarToDB(
        user.userId,
        org.orgId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Google Calendar sync completed successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get sync status for current user
   */
  async getSyncStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Get OAuth account
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: user.userId,
          provider: "GOOGLE",
        },
      });

      if (!oauthAccount) {
        throw ErrorFactory.unauthorized(
          "User does not have Google OAuth connected",
        );
      }

      // Get sync status
      const syncStatus = await googleCalendarSyncService.getSyncStatus(
        user.userId,
        oauthAccount.id,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Sync status retrieved successfully",
        data: syncStatus,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get synced Google Calendar events
   */
  async getSyncedEvents(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { startDate, endDate, limit = 50, offset = 0 } = req.query;

      // Validate date range
      if (!startDate || !endDate) {
        throw ErrorFactory.validation("Start date and end date are required");
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw ErrorFactory.validation("Invalid date format");
      }

      // Get synced events
      const events = await prisma.googleCalendarEvent.findMany({
        where: {
          userId: user.userId,
          startTime: {
            gte: start,
            lte: end,
          },
          status: {
            not: "cancelled",
          },
        },
        orderBy: {
          startTime: "asc",
        },
        skip: parseInt(offset as string, 10),
        take: parseInt(limit as string, 10),
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Synced events retrieved successfully",
        data: {
          events,
          pagination: {
            count: events.length,
            limit: parseInt(limit as string, 10),
            offset: parseInt(offset as string, 10),
          },
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Link a Google Calendar event to a Meeting
   */
  async linkEventToMeeting(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const { googleEventId, meetingId } = req.body;

      // Validate inputs
      if (!googleEventId || !meetingId) {
        throw ErrorFactory.validation(
          "googleEventId and meetingId are required",
        );
      }

      // Verify meeting exists
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
      });

      if (!meeting) {
        throw ErrorFactory.notFound("Meeting");
      }

      // Link event to meeting
      const result = await googleCalendarSyncService.linkGoogleEventToMeeting(
        user.userId,
        googleEventId,
        meetingId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Event linked to meeting successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const syncController = new SyncController();
