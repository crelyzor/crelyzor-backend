import { Request, Response } from "express";
import { organizationSettingsService } from "../services/organizationSettingsService";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  globalErrorHandler,
  BaseError,
  ErrorFactory,
} from "../utils/globalErrorHandler";
import { updateMeetingPreferenceSchema } from "../validators/organizationSettingsSchema";

export const updateMeetingPreference = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw ErrorFactory.unauthorized("User not authenticated");
    }

    const validatedData = updateMeetingPreferenceSchema.parse(req.body);

    const result = await organizationSettingsService.updateMeetingPreference(
      userId,
      validatedData,
    );

    apiResponse(res, {
      statusCode: 200,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("❌ Error updating meeting preference:", error);
    globalErrorHandler(error as BaseError, req, res);
  }
};

export const getMeetingPreference = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw ErrorFactory.unauthorized("User not authenticated");
    }

    const result =
      await organizationSettingsService.getMeetingPreference(userId);

    apiResponse(res, {
      statusCode: 200,
      message: "Meeting preference fetched successfully",
      data: result.data,
    });
  } catch (error) {
    console.error("❌ Error fetching meeting preference:", error);
    globalErrorHandler(error as BaseError, req, res);
  }
};
