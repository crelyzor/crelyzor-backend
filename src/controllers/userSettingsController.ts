import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { logger } from "../utils/logging/logger";
import { patchUserSettingsSchema } from "../validators/userSettingsSchema";
import { saveRecallApiKeySchema } from "../validators/recallSchema";
import {
  getOrCreateUserSettings,
  updateUserSettings,
  upsertRecallApiKey,
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

/**
 * PUT /settings/recall-api-key
 * Saves the user's Recall.ai API key (encrypted at rest).
 * The key is never returned in any response.
 */
export const saveRecallApiKey = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = saveRecallApiKeySchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  await upsertRecallApiKey(userId, validated.data.apiKey);

  logger.info("Recall.ai API key saved via API", { userId });

  return apiResponse(res, {
    statusCode: 200,
    message: "Recall.ai API key saved",
    data: { recallEnabled: false }, // key saved but not yet enabled — user must toggle via PATCH /settings/user
  });
};
