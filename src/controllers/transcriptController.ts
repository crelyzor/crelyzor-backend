import type { Request, Response } from "express";
import { transcriptionService } from "../services/transcription/transcriptionService";
import { logger } from "../utils/logging/logger";

/**
 * Get transcript for a meeting
 */
export const getTranscript = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    const transcript = await transcriptionService.getTranscript(meetingId);

    if (!transcript) {
      res.status(404).json({
        success: false,
        message: "No transcript found for this meeting",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: transcript,
    });
  } catch (error) {
    logger.error("Error getting transcript:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Check transcription status
 */
export const getTranscriptionStatus = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    const transcript = await transcriptionService.getTranscript(meetingId);

    res.status(200).json({
      success: true,
      data: {
        hasTranscript: !!transcript,
        transcriptId: transcript?.id || null,
        isEnabled: transcriptionService.isEnabled(),
      },
    });
  } catch (error) {
    logger.error("Error getting transcription status:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
