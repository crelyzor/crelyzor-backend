import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  patchAvailabilitySchema,
  createOverrideSchema,
  overrideIdParamSchema,
} from "../validators/availabilitySchema";
import * as availabilityService from "../services/scheduling/availabilityService";

/**
 * GET /scheduling/availability
 * Returns a normalized 7-row weekly schedule (isOff: true for days without availability).
 */
export const getAvailability = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const schedule = await availabilityService.getAvailability(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Availability fetched",
    data: { schedule },
  });
};

/**
 * PATCH /scheduling/availability
 * Bulk upsert weekly schedule. Each entry is on (startTime + endTime) or off (isOff: true).
 */
export const patchAvailability = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = patchAvailabilitySchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  await availabilityService.patchAvailability(userId, validated.data.days);

  // Return updated schedule after write
  const schedule = await availabilityService.getAvailability(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Availability updated",
    data: { schedule },
  });
};

/**
 * GET /scheduling/availability/overrides
 * Returns all date overrides (blocked days), sorted by date ascending.
 */
export const getOverrides = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const overrides = await availabilityService.getOverrides(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Overrides fetched",
    data: { overrides },
  });
};

/**
 * POST /scheduling/availability/overrides
 * Block a specific date (idempotent — same date can be submitted multiple times).
 */
export const createOverride = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = createOverrideSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const override = await availabilityService.createOverride(
    userId,
    validated.data,
  );

  return apiResponse(res, {
    statusCode: 201,
    message: "Override created",
    data: { override },
  });
};

/**
 * DELETE /scheduling/availability/overrides/:id
 * Unblock a specific date (soft delete).
 */
export const deleteOverride = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = overrideIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid override ID", 400);

  await availabilityService.deleteOverride(userId, params.data.id);

  return apiResponse(res, {
    statusCode: 200,
    message: "Override deleted",
  });
};
