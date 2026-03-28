import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { logger } from "../utils/logging/logger";
import { patchUserSettingsSchema } from "../validators/userSettingsSchema";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../services/scheduling/userSettingsService";

/**
 * GET /settings/user
 * Returns the authenticated user's settings (created with defaults on first call).
 */
export const getSettings = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const settings = await getOrCreateUserSettings(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Settings fetched",
    data: { settings },
  });
};

/**
 * PATCH /settings/user
 * Updates one or more settings fields. Unknown fields are rejected (schema is strict).
 */
export const updateSettings = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = patchUserSettingsSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const settings = await updateUserSettings(userId, validated.data);

  logger.info("Settings updated via API", { userId });

  return apiResponse(res, {
    statusCode: 200,
    message: "Settings updated",
    data: { settings },
  });
};
