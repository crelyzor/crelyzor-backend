import os from "os";
import path from "path";
import fs from "fs/promises";
import prisma from "../../db/prismaClient";
import { MeetingRecording } from "@prisma/client";
import { gcsService } from "../gcs/gcsService";
import {
  getTranscriptionQueue,
  getAIProcessingQueue,
} from "../../config/queue";
import { logger } from "../../utils/logging/logger";
import { TranscriptionStatus } from "@prisma/client";
import { getAudioDuration } from "../../utils/audio/getAudioDuration";
import { AppError } from "../../utils/errors/AppError";

export interface UploadRecordingInput {
  meetingId: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  uploadedBy: string;
  /** Duration sent by the client (ms-accurate stopwatch). Used as fallback if ffprobe/ffmpeg fail. */
  clientDuration?: number;
}

export interface RecordingResponse {
  id: string;
  meetingId: string;
  fileName: string;
  fileSize: number;
  duration: number;
  uploadedAt: Date;
  uploadedBy: string;
  signedUrl?: string;
  signedUrlError?: boolean;
}

/**
 * Upload a recording for a meeting
 */
export const uploadRecording = async (
  input: UploadRecordingInput,
): Promise<RecordingResponse> => {
  const { meetingId, file, uploadedBy, clientDuration } = input;

  // Verify meeting exists and belongs to the uploader
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: uploadedBy, isDeleted: false },
  });

  if (!meeting) {
    throw new AppError(`Meeting not found`, 404);
  }

  // Extract audio duration. Try ffprobe/ffmpeg first; fall back to client-reported value.
  let duration = 0;
  const tmpPath = path.join(
    os.tmpdir(),
    `${Date.now()}-${path.basename(file.originalname)}`,
  );
  try {
    await fs.writeFile(tmpPath, file.buffer);
    duration = await getAudioDuration(tmpPath);
  } catch (err) {
    logger.warn("Could not extract audio duration via ffprobe/ffmpeg", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (clientDuration && clientDuration > 0) {
      duration = clientDuration;
      logger.info("Using client-reported duration as fallback", { duration });
    }
  } finally {
    try {
      await fs.unlink(tmpPath);
    } catch (err) {
      logger.warn("Failed to clean up temp audio file", {
        tmpPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Upload to GCS
  const uploadResult = await gcsService.uploadFile(
    file.buffer,
    file.originalname,
    `recordings/${meetingId}`,
    file.mimetype,
  );

  // Create recording record and update meeting transcription status atomically
  const recording = await prisma.$transaction(
    async (tx) => {
      const rec = await tx.meetingRecording.create({
        data: {
          meetingId,
          fileName: uploadResult.fileName,
          gcsPath: uploadResult.filePath,
          fileSize: file.size,
          duration,
          uploadedBy,
        },
      });

      await tx.meeting.update({
        where: { id: meetingId },
        data: { transcriptionStatus: TranscriptionStatus.UPLOADED },
      });

      return rec;
    },
    { timeout: 15000 },
  );

  // Queue transcription job
  try {
    const queue = getTranscriptionQueue();
    await queue.add(
      "transcribe",
      {
        recordingId: recording.id,
        meetingId,
      },
      {
        jobId: `transcribe-${recording.id}`,
      },
    );
    logger.info(`Transcription job queued for recording ${recording.id}`);
  } catch (err) {
    logger.error(
      "Failed to queue transcription job — reverting transcription status to NONE",
      {
        recordingId: recording.id,
        error: err instanceof Error ? err.message : String(err),
      },
    );
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { transcriptionStatus: TranscriptionStatus.NONE },
    });
    throw new AppError(
      "Recording saved but transcription could not be queued. Please retry.",
      503,
    );
  }

  // Generate signed URL for immediate access
  const signedUrl = await gcsService.getSignedUrl(uploadResult.filePath);

  return {
    id: recording.id,
    meetingId: recording.meetingId,
    fileName: recording.fileName,
    fileSize: recording.fileSize,
    duration: recording.duration,
    uploadedAt: recording.uploadedAt,
    uploadedBy: recording.uploadedBy,
    signedUrl,
  };
};

/**
 * Get recordings for a meeting (scoped to meeting owner)
 */
export const getRecordings = async (
  meetingId: string,
  userId: string,
): Promise<RecordingResponse[]> => {
  // Verify meeting ownership
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const recordings = await prisma.meetingRecording.findMany({
    where: { meetingId, isDeleted: false },
    orderBy: { uploadedAt: "desc" },
    take: 20,
  });

  // Generate signed URLs for each recording
  const recordingsWithUrls = await Promise.all(
    recordings.map(async (recording: MeetingRecording) => {
      let signedUrl: string | undefined;
      let signedUrlError: boolean | undefined;
      try {
        signedUrl = await gcsService.getSignedUrl(recording.gcsPath);
      } catch (err) {
        signedUrlError = true;
        logger.warn(
          `Failed to generate signed URL for recording ${recording.id}`,
          {
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }

      return {
        id: recording.id,
        meetingId: recording.meetingId,
        fileName: recording.fileName,
        fileSize: recording.fileSize,
        duration: recording.duration,
        uploadedAt: recording.uploadedAt,
        uploadedBy: recording.uploadedBy,
        signedUrl,
        signedUrlError,
      };
    }),
  );

  return recordingsWithUrls;
};

/**
 * Delete a recording (scoped to meeting owner)
 */
export const deleteRecording = async (
  recordingId: string,
  userId: string,
): Promise<void> => {
  const recording = await prisma.meetingRecording.findFirst({
    where: { id: recordingId, isDeleted: false },
    include: { meeting: { select: { createdById: true, isDeleted: true } } },
  });

  if (
    !recording ||
    recording.meeting.isDeleted ||
    recording.meeting.createdById !== userId
  ) {
    throw new AppError("Recording not found", 404);
  }

  // Delete from GCS — fail hard so the DB record is not orphaned on GCS failure
  try {
    await gcsService.deleteFile(recording.gcsPath);
  } catch (err) {
    logger.error("Failed to delete file from GCS — aborting recording delete", {
      gcsPath: recording.gcsPath,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError("Failed to delete recording file — please try again", 500);
  }

  // Soft-delete the recording and its linked transcript atomically
  await prisma.$transaction(
    async (tx) => {
      await tx.meetingRecording.update({
        where: { id: recordingId },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      // Soft-delete the linked transcript so it is no longer returned by any query
      await tx.meetingTranscript.updateMany({
        where: { recordingId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    },
    { timeout: 15000 },
  );

  logger.info(`Recording soft-deleted: ${recordingId}`);
};

/**
 * Trigger AI processing for a meeting (scoped to meeting owner)
 */
export const triggerAIProcessing = async (
  meetingId: string,
  userId: string,
): Promise<void> => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true, createdById: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
  });

  if (!transcript) {
    throw new AppError(`No transcript found for meeting ${meetingId}`, 404);
  }

  try {
    const queue = getAIProcessingQueue();
    await queue.add(
      "process-ai",
      {
        meetingId,
        transcriptId: transcript.id,
        ownerId: meeting.createdById,
      },
      {
        jobId: `ai-${meetingId}-${Date.now()}`,
      },
    );
    logger.info(`AI processing job queued for meeting ${meetingId}`);
  } catch (err) {
    logger.error("Failed to queue AI processing job", {
      meetingId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError("AI processing could not be queued — please try again", 503);
  }
};

export const recordingService = {
  uploadRecording,
  getRecordings,
  deleteRecording,
  triggerAIProcessing,
};
