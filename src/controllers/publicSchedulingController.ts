import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  getSlotsParamSchema,
  getSlotsQuerySchema,
  usernameParamSchema,
} from "../validators/schedulingPublicSchema";
import * as slotService from "../services/scheduling/slotService";

/**
 * GET /public/scheduling/slots/:username/:eventTypeSlug?date=YYYY-MM-DD
 *
 * Returns available booking slots for a given host + event type + date.
 * No auth required. All times returned as UTC ISO strings.
 */
export const getPublicSlots = async (req: Request, res: Response) => {
  const params = getSlotsParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid path parameters", 400);

  const query = getSlotsQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError("Validation failed", 400);

  const { username, eventTypeSlug } = params.data;
  const { date } = query.data;

  const result = await slotService.getSlots(username, eventTypeSlug, date);

  return apiResponse(res, {
    statusCode: 200,
    message: "Slots fetched",
    data: result,
  });
};

/**
 * GET /public/scheduling/profile/:username
 *
 * Returns a user's public scheduling profile — display info + active event types.
 * Used by the booking page to render the event type picker.
 * No auth required.
 */
export const getPublicSchedulingProfile = async (
  req: Request,
  res: Response,
) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid username", 400);

  const profile = await slotService.getSchedulingProfile(params.data.username);

  return apiResponse(res, {
    statusCode: 200,
    message: "Profile fetched",
    data: profile,
  });
};
