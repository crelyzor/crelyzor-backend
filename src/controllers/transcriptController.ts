import type { Request, Response } from "express";
import { transcriptionService } from "../services/transcription/transcriptionService";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  patchSegmentBodySchema,
  patchSummaryBodySchema,
  changeLanguageSchema,
} from "../validators/transcriptEditSchema";
import { updateSegment, updateSummary } from "../services/smaEditService";
import { z } from "zod";

const uuidSchema = z.string().uuid();

/**
 * Get transcript for a meeting
 */
export const getTranscript = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;

  const transcript = await transcriptionService.getTranscript(meetingId);

  if (!transcript) {
    throw new AppError("No transcript found for this meeting", 404);
  }

  return apiResponse(res, {
    statusCode: 200,
    message: "Transcript fetched",
    data: transcript,
  });
};

/**
 * PATCH /sma/meetings/:meetingId/transcript/segments/:segmentId
 * Edit the text of a single transcript segment.
 */
export const patchSegment = async (req: Request, res: Response) => {
  const { meetingId, segmentId } = req.params;
  const userId = req.user!.userId;

  const body = patchSegmentBodySchema.safeParse(req.body);
  if (!body.success)
    throw new AppError("text is required (max 10000 chars)", 400);

  const segment = await updateSegment(
    meetingId,
    segmentId,
    body.data.text,
    userId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Segment updated",
    data: { segment },
  });
};

/**
 * PATCH /sma/meetings/:meetingId/summary
 * Manually override AI summary fields and/or meeting title.
 */
export const patchSummary = async (req: Request, res: Response) => {
  const { meetingId } = req.params;
  const userId = req.user!.userId;

  const body = patchSummaryBodySchema.safeParse(req.body);
  if (!body.success)
    throw new AppError(
      "Validation failed: provide summary, keyPoints, or title",
      400,
    );

  const result = await updateSummary(meetingId, body.data, userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Summary updated",
    data: result,
  });
};

/**
 * Check transcription status
 */
export const getTranscriptionStatus = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;

  const transcript = await transcriptionService.getTranscript(meetingId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Transcription status fetched",
    data: {
      hasTranscript: !!transcript,
      transcriptId: transcript?.id || null,
      isEnabled: transcriptionService.isEnabled(),
    },
  });
};

/**
 * POST /sma/meetings/:meetingId/transcript/regenerate
 * Re-run Deepgram transcription for the existing recording (same language).
 */
export const regenerateTranscript = async (req: Request, res: Response) => {
  const meetingIdResult = uuidSchema.safeParse(req.params.meetingId);
  if (!meetingIdResult.success) throw new AppError("Invalid meetingId", 400);

  const meetingId = meetingIdResult.data;
  const userId = req.user!.userId;

  await transcriptionService.regenerateTranscript(meetingId, userId);

  logger.info("Transcript regeneration triggered", { meetingId, userId });

  return apiResponse(res, {
    statusCode: 200,
    message: "Transcription started",
  });
};

/**
 * POST /sma/meetings/:meetingId/language
 * Re-run Deepgram transcription with a new BCP 47 language code.
 */
export const changeLanguage = async (req: Request, res: Response) => {
  const meetingIdResult = uuidSchema.safeParse(req.params.meetingId);
  if (!meetingIdResult.success) throw new AppError("Invalid meetingId", 400);

  const meetingId = meetingIdResult.data;
  const userId = req.user!.userId;

  const body = changeLanguageSchema.safeParse(req.body);
  if (!body.success)
    throw new AppError("language is required (BCP 47, e.g. en, en-US)", 400);

  await transcriptionService.regenerateTranscript(
    meetingId,
    userId,
    body.data.language,
  );

  logger.info("Language change triggered", {
    meetingId,
    userId,
    language: body.data.language,
  });

  return apiResponse(res, {
    statusCode: 200,
    message: "Transcription started",
  });
};
