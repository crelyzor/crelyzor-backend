import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { getCalendarEventsSchema } from "../validators/integrationSchema";
import {
  fetchGCalEvents,
  getGCalConnectionStatus,
  disconnectGCalendar,
} from "../services/googleCalendarService";
import {
  registerWatchChannel,
  stopWatchChannel,
} from "../services/googleCalendarPushService";

/**
 * GET /integrations/google/events?start=&end=
 * Returns the user's Google Calendar events for the given time window.
 * Returns [] when GCal is not connected or sync is disabled (fail-open).
 */
export const getGoogleCalendarEvents = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const query = getCalendarEventsSchema.safeParse(req.query);
  if (!query.success) throw new AppError("Validation failed", 400);

  const events = await fetchGCalEvents(
    userId,
    query.data.start,
    query.data.end,
  );

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

/**
 * DELETE /integrations/google/disconnect
 * Removes Google Calendar access — strips calendar scopes and clears calendar settings.
 */
export const disconnectGoogleCalendar = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await disconnectGCalendar(userId);

  // Phase 4.3: stop push channel (fail-open — after DB changes are committed)
  await stopWatchChannel(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Google Calendar disconnected",
    data: null,
  });
};

/**
 * POST /integrations/google/calendar/push/register
 * Manually (re-)register a GCal push watch channel for the authenticated user.
 * Used by the frontend to backfill existing connected users on Settings page load.
 */
export const registerGCalPushChannel = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const status = await getGCalConnectionStatus(userId);
  if (!status.connected) {
    throw new AppError("Google Calendar is not connected", 400);
  }

  await registerWatchChannel(userId);

  const updated = await getGCalConnectionStatus(userId);
  return apiResponse(res, {
    statusCode: 200,
    message: "Push channel registered",
    data: { pushEnabled: updated.pushEnabled },
  });
};
