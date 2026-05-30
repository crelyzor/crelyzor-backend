import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { logger } from "../utils/logging/logger";
import { getTeamContext } from "../middleware/teamContext";
import {
  createEventTypeSchema,
  updateEventTypeSchema,
  eventTypeIdParamSchema,
} from "../validators/eventTypeSchema";
import * as eventTypeService from "../services/scheduling/eventTypeService";

/**
 * GET /scheduling/event-types
 */
export const listEventTypes = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);
  const eventTypes = await eventTypeService.listEventTypes(userId, teamContext);

  return apiResponse(res, {
    statusCode: 200,
    message: "Event types fetched",
    data: { eventTypes },
  });
};

/**
 * POST /scheduling/event-types
 */
export const createEventType = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const validated = createEventTypeSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const eventType = await eventTypeService.createEventType(
    userId,
    validated.data,
    teamContext,
  );

  logger.info("Event type created via API", {
    eventTypeId: eventType.id,
    userId,
    teamId: teamContext?.teamId ?? null,
  });

  return apiResponse(res, {
    statusCode: 201,
    message: "Event type created",
    data: { eventType },
  });
};

/**
 * PATCH /scheduling/event-types/:id
 */
export const updateEventType = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const params = eventTypeIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid event type ID", 400);

  const validated = updateEventTypeSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const eventType = await eventTypeService.updateEventType(
    userId,
    params.data.id,
    validated.data,
    teamContext,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Event type updated",
    data: { eventType },
  });
};

/**
 * DELETE /scheduling/event-types/:id
 */
export const deleteEventType = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const params = eventTypeIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid event type ID", 400);

  await eventTypeService.deleteEventType(userId, params.data.id, teamContext);

  return apiResponse(res, {
    statusCode: 200,
    message: "Event type deleted",
  });
};
