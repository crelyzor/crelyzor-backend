import type { Request, Response } from "express";
import { recordingService } from "../services/recording/recordingService";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { logger } from "../utils/logging/logger";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * Upload a recording for a meeting
 */
export const uploadRecording = async (req: MulterRequest, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;
    const memberId = req.user?.userId;

    if (!req.file) {
      throw ErrorFactory.validation("No file uploaded");
    }

    if (!memberId) {
      throw ErrorFactory.unauthorized("User not authenticated");
    }

    const recording = await recordingService.uploadRecording({
      meetingId,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      uploadedBy: memberId,
    });

    res.status(201).json({
      success: true,
      data: recording,
    });
  } catch (error) {
    logger.error("Error uploading recording:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Get recordings for a meeting
 */
export const getRecordings = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    const recordings = await recordingService.getRecordings(meetingId);

    res.status(200).json({
      success: true,
      data: recordings,
    });
  } catch (error) {
    logger.error("Error getting recordings:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Delete a recording
 */
export const deleteRecording = async (req: Request, res: Response) => {
  try {
    const recordingId = req.params.recordingId as string;

    await recordingService.deleteRecording(recordingId);

    res.status(200).json({
      success: true,
      message: "Recording deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting recording:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Trigger AI processing for a meeting
 */
export const triggerAIProcessing = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    await recordingService.triggerAIProcessing(meetingId);

    res.status(200).json({
      success: true,
      message: "AI processing triggered successfully",
    });
  } catch (error) {
    logger.error("Error triggering AI processing:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
