import prisma from "../../db/prismaClient";
import { MeetingRecording } from "@prisma/client";
import { gcsService } from "../gcs/gcsService";
import {
  getTranscriptionQueue,
  getAIProcessingQueue,
} from "../../config/queue";
import { logger } from "../../utils/logging/logger";
import { TranscriptionStatus } from "@prisma/client";

export interface UploadRecordingInput {
  meetingId: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  uploadedBy: string;
  duration?: number;
}

export interface RecordingResponse {
  id: string;
  meetingId: string;
  fileName: string;
  gcsPath: string;
  fileSize: number;
  duration: number;
  uploadedAt: Date;
  uploadedBy: string;
  signedUrl?: string;
}

/**
 * Upload a recording for a meeting
 */
export const uploadRecording = async (
  input: UploadRecordingInput,
): Promise<RecordingResponse> => {
  const { meetingId, file, uploadedBy, duration = 0 } = input;

  // Verify meeting exists
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!meeting) {
    throw new Error(`Meeting not found: ${meetingId}`);
  }

  // Upload to GCS
  const uploadResult = await gcsService.uploadFile(
    file.buffer,
    file.originalname,
    `recordings/${meetingId}`,
    file.mimetype,
  );

  // Create recording record
  const recording = await prisma.meetingRecording.create({
    data: {
      meetingId,
      fileName: uploadResult.fileName,
      gcsPath: uploadResult.filePath,
      fileSize: file.size,
      duration,
      uploadedBy,
    },
  });

  // Update meeting transcription status
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { transcriptionStatus: TranscriptionStatus.UPLOADED },
  });

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
    logger.warn(
      "Failed to queue transcription job (Redis may not be available):",
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }

  // Generate signed URL for immediate access
  const signedUrl = await gcsService.getSignedUrl(uploadResult.filePath);

  return {
    id: recording.id,
    meetingId: recording.meetingId,
    fileName: recording.fileName,
    gcsPath: recording.gcsPath,
    fileSize: recording.fileSize,
    duration: recording.duration,
    uploadedAt: recording.uploadedAt,
    uploadedBy: recording.uploadedBy,
    signedUrl,
  };
};

/**
 * Get recordings for a meeting
 */
export const getRecordings = async (
  meetingId: string,
): Promise<RecordingResponse[]> => {
  const recordings = await prisma.meetingRecording.findMany({
    where: { meetingId },
    orderBy: { uploadedAt: "desc" },
  });

  // Generate signed URLs for each recording
  const recordingsWithUrls = await Promise.all(
    recordings.map(async (recording: MeetingRecording) => {
      let signedUrl: string | undefined;
      try {
        signedUrl = await gcsService.getSignedUrl(recording.gcsPath);
      } catch {
        logger.warn(
          `Failed to generate signed URL for recording ${recording.id}`,
        );
      }

      return {
        id: recording.id,
        meetingId: recording.meetingId,
        fileName: recording.fileName,
        gcsPath: recording.gcsPath,
        fileSize: recording.fileSize,
        duration: recording.duration,
        uploadedAt: recording.uploadedAt,
        uploadedBy: recording.uploadedBy,
        signedUrl,
      };
    }),
  );

  return recordingsWithUrls;
};

/**
 * Delete a recording
 */
export const deleteRecording = async (recordingId: string): Promise<void> => {
  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
  });

  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  // Delete from GCS
  try {
    await gcsService.deleteFile(recording.gcsPath);
  } catch (err) {
    logger.warn(`Failed to delete file from GCS: ${recording.gcsPath}`);
  }

  // Delete related transcript
  await prisma.meetingTranscript.deleteMany({
    where: { recordingId },
  });

  // Delete recording record
  await prisma.meetingRecording.delete({
    where: { id: recordingId },
  });

  logger.info(`Recording deleted: ${recordingId}`);
};

/**
 * Trigger AI processing for a meeting
 */
export const triggerAIProcessing = async (meetingId: string): Promise<void> => {
  const [transcript, meeting] = await Promise.all([
    prisma.meetingTranscript.findFirst({ where: { recording: { meetingId } } }),
    prisma.meeting.findUnique({ where: { id: meetingId } }),
  ]);

  if (!transcript) {
    throw new Error(`No transcript found for meeting ${meetingId}`);
  }

  try {
    const queue = getAIProcessingQueue();
    await queue.add(
      "process-ai",
      {
        meetingId,
        transcriptId: transcript.id,
        ownerId: meeting?.createdById ?? "",
      },
      {
        jobId: `ai-${meetingId}-${Date.now()}`,
      },
    );
    logger.info(`AI processing job queued for meeting ${meetingId}`);
  } catch (err) {
    logger.warn("Failed to queue AI processing job:", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

export const recordingService = {
  uploadRecording,
  getRecordings,
  deleteRecording,
  triggerAIProcessing,
};
