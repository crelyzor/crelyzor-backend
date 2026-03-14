import type { Request, Response } from "express";
import { speakerService } from "../services/speaker/speakerService";
import { renameSpeakerSchema } from "../validators/speakerSchema";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import { apiResponse } from "../utils/globalResponseHandler";

/**
 * GET /sma/meetings/:meetingId/speakers
 */
export const getSpeakers = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;
    const userId = req.user!.userId;

    const speakers = await speakerService.getSpeakers(meetingId, userId);

    apiResponse(res, {
      statusCode: 200,
      message: "Speakers fetched",
      data: speakers,
    });
  } catch (error) {
    logger.error("Error getting speakers:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * PATCH /sma/meetings/:meetingId/speakers/:speakerId
 */
export const renameSpeaker = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;
    const speakerId = req.params.speakerId as string;
    const userId = req.user!.userId;

    const parsed = renameSpeakerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Validation failed", 400);
    }

    const updated = await speakerService.renameSpeaker(
      meetingId,
      speakerId,
      parsed.data,
      userId,
    );

    apiResponse(res, {
      statusCode: 200,
      message: "Speaker renamed",
      data: updated,
    });
  } catch (error) {
    logger.error("Error renaming speaker:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
