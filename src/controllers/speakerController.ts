import type { Request, Response } from "express";
import { z } from "zod";
import { speakerService } from "../services/speaker/speakerService";
import { renameSpeakerSchema } from "../validators/speakerSchema";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";

const uuidSchema = z.string().uuid();

/**
 * GET /sma/meetings/:meetingId/speakers
 */
export const getSpeakers = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user!.userId;

  const speakers = await speakerService.getSpeakers(meetingId, userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Speakers fetched",
    data: speakers,
  });
};

/**
 * PATCH /sma/meetings/:meetingId/speakers/:speakerId
 */
export const renameSpeaker = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const speakerId = req.params.speakerId as string;
  if (!uuidSchema.safeParse(speakerId).success)
    throw new AppError("Invalid speakerId", 400);
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

  return apiResponse(res, {
    statusCode: 200,
    message: "Speaker renamed",
    data: updated,
  });
};
