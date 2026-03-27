import type { Request, Response } from "express";
import { z } from "zod";
import { recordingService } from "../services/recording/recordingService";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";

const uuidSchema = z.string().uuid();

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * Upload a recording for a meeting
 */
export const uploadRecording = async (req: MulterRequest, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success) throw ErrorFactory.validation("Invalid meetingId");
  const memberId = req.user?.userId;

  if (!req.file) {
    throw ErrorFactory.validation("No file uploaded");
  }

  if (!memberId) {
    throw ErrorFactory.unauthorized("User not authenticated");
  }

  const clientDuration = req.body?.duration
    ? parseInt(req.body.duration, 10)
    : undefined;

  const recording = await recordingService.uploadRecording({
    meetingId,
    file: {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    },
    uploadedBy: memberId,
    clientDuration,
  });

  return apiResponse(res, {
    statusCode: 201,
    message: "Recording uploaded successfully",
    data: recording,
  });
};

/**
 * Get recordings for a meeting
 */
export const getRecordings = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success) throw ErrorFactory.validation("Invalid meetingId");
  const userId = req.user?.userId;

  if (!userId) {
    throw ErrorFactory.unauthorized("User not authenticated");
  }

  const recordings = await recordingService.getRecordings(meetingId, userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Recordings fetched",
    data: recordings,
  });
};

/**
 * Delete a recording
 */
export const deleteRecording = async (req: Request, res: Response) => {
  const recordingId = req.params.recordingId as string;
  if (!uuidSchema.safeParse(recordingId).success) throw ErrorFactory.validation("Invalid recordingId");
  const userId = req.user?.userId;

  if (!userId) {
    throw ErrorFactory.unauthorized("User not authenticated");
  }

  await recordingService.deleteRecording(recordingId, userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Recording deleted successfully",
  });
};

/**
 * Trigger AI processing for a meeting
 */
export const triggerAIProcessing = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success) throw ErrorFactory.validation("Invalid meetingId");
  const userId = req.user?.userId;

  if (!userId) {
    throw ErrorFactory.unauthorized("User not authenticated");
  }

  await recordingService.triggerAIProcessing(meetingId, userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "AI processing triggered successfully",
  });
};
