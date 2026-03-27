import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { getCalendarEventsSchema } from "../validators/integrationSchema";
import {
  fetchGCalEvents,
  getGCalConnectionStatus,
} from "../services/googleCalendarService";

/**
 * GET /integrations/google/events?start=&end=
 * Returns the user's Google Calendar events for the given time window.
 * Returns [] when GCal is not connected or sync is disabled (fail-open).
 */
export const getGoogleCalendarEvents = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const query = getCalendarEventsSchema.safeParse(req.query);
  if (!query.success) throw new AppError("Validation failed", 400);

  const events = await fetchGCalEvents(userId, query.data.start, query.data.end);

  return apiResponse(res, {
    statusCode: 200,
    message: "Calendar events fetched",
    data: { events },
  });
};

/**
 * GET /integrations/google/status
 * Returns whether Google Calendar is connected and sync is enabled.
 */
export const getGoogleCalendarStatus = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const status = await getGCalConnectionStatus(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Google Calendar status fetched",
    data: status,
  });
};
