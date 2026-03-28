import {
  getTranscriptionQueue,
  getAIProcessingQueue,
  getRecallBotQueue,
  getRecallRecordingQueue,
  closeQueues,
  JobNames,
  TranscriptionJobData,
  AIProcessingJobData,
  RecallBotJobData,
  RecallRecordingJobData,
} from "../config/queue";
import { transcriptionService } from "../services/transcription/transcriptionService";
import { aiService } from "../services/ai/aiService";
import { deployBot, getRecordingUrl } from "../services/recall/recallService";
import { gcsService } from "../services/gcs/gcsService";
import { logger } from "../utils/logging/logger";
import { TranscriptionStatus } from "@prisma/client";
import prisma from "../db/prismaClient";

/**
 * Initialize and start all queue processors
 */
export const startWorker = async (): Promise<void> => {
  logger.info("Starting queue worker...");

  // Transcription queue processor
  const transcriptionQueue = getTranscriptionQueue();
  transcriptionQueue.process("transcribe", async (job) => {
    const data = job.data as TranscriptionJobData;
    logger.info(
      `Processing transcription job for recording ${data.recordingId}`,
    );

    try {
      await transcriptionService.transcribeRecording(
        data.recordingId,
        data.language,
      );

      // Get meeting to find owner for AI processing (skip if soft-deleted)
      const meeting = await prisma.meeting.findFirst({
        where: { id: data.meetingId, isDeleted: false },
        select: { createdById: true },
      });

      if (!meeting?.createdById) {
        throw new Error(
          `Meeting ${data.meetingId} not found or has no owner — aborting AI queue`,
        );
      }

      // Automatically queue AI processing after transcription
      const aiQueue = getAIProcessingQueue();
      await aiQueue.add("process-ai", {
        meetingId: data.meetingId,
        transcriptId: data.recordingId,
        ownerId: meeting.createdById,
      });

      return { success: true };
    } catch (error) {
      logger.error("Transcription job failed:", {
        recordingId: data.recordingId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  });

  // AI processing queue processor
  const aiQueue = getAIProcessingQueue();
  aiQueue.process("process-ai", async (job) => {
    const data = job.data as AIProcessingJobData;
    logger.info(`Processing AI job for meeting ${data.meetingId}`);

    try {
      const result = await aiService.processTranscriptWithAI(
        data.meetingId,
        data.ownerId,
      );

      return { success: true, result };
    } catch (error) {
      logger.error("AI processing job failed:", {
        meetingId: data.meetingId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  });

  // Recall bot deployment processor
  const recallBotQueue = getRecallBotQueue();
  recallBotQueue.process(JobNames.DEPLOY_RECALL_BOT, async (job) => {
    const data = job.data as RecallBotJobData;
    logger.info("Processing Recall bot deploy job", { meetingId: data.meetingId });

    try {
      // Fetch meeting + host settings — both must exist for deployment to proceed
      const [meeting, userSettings] = await Promise.all([
        prisma.meeting.findFirst({
          where: { id: data.meetingId, isDeleted: false },
          select: {
            id: true,
            meetLink: true,
            startTime: true,
            booking: {
              select: {
                eventType: {
                  select: { meetingLink: true },
                },
              },
            },
          },
        }),
        prisma.userSettings.findUnique({
          where: { userId: data.hostUserId },
          select: { recallEnabled: true },
        }),
      ]);

      if (!meeting) {
        throw new Error(`Meeting ${data.meetingId} not found — skipping bot deploy`);
      }
      // Meeting link can come from booking event type or directly from the meeting (Meet link)
      const meetingLink = meeting.booking?.eventType?.meetingLink ?? meeting.meetLink;
      if (!meetingLink) {
        throw new Error(`Meeting ${data.meetingId} has no meetingLink — cannot deploy bot`);
      }
      if (!userSettings?.recallEnabled) {
        logger.warn("Recall not enabled — skipping bot deploy", {
          meetingId: data.meetingId,
          hostUserId: data.hostUserId,
        });
        return { skipped: true };
      }

      // Join 5 minutes before start
      const joinAt = new Date(meeting.startTime.getTime() - 5 * 60 * 1000).toISOString();

      const { botId } = await deployBot(meetingLink, joinAt);

      // Store botId on the meeting for webhook correlation
      await prisma.meeting.update({
        where: { id: data.meetingId },
        data: { recallBotId: botId },
      });

      logger.info("Recall bot deployed", { meetingId: data.meetingId, botId });
      return { success: true, botId };
    } catch (err) {
      logger.error("Recall bot deploy job failed", {
        meetingId: data.meetingId,
        hostUserId: data.hostUserId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err; // re-throw so Bull marks the job as failed
    }
  });

  // Recall recording download + transcription pipeline processor
  const recallRecordingQueue = getRecallRecordingQueue();
  recallRecordingQueue.process(JobNames.FETCH_RECALL_RECORDING, async (job) => {
    const data = job.data as RecallRecordingJobData;
    logger.info("Processing Recall recording fetch job", { meetingId: data.meetingId, botId: data.botId });

    try {
      // Fetch recording download URL from Recall.ai (uses platform key from env)
      const downloadUrl = await getRecordingUrl(data.botId);

      // Download the recording bytes
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download Recall recording: HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to GCS under the meeting's recordings folder
      const uploadResult = await gcsService.uploadFile(
        buffer,
        `recall-${data.botId}.mp4`,
        `recordings/${data.meetingId}`,
        "video/mp4",
      );

      // Create MeetingRecording and set transcription status atomically
      const recording = await prisma.$transaction(
        async (tx) => {
          const rec = await tx.meetingRecording.create({
            data: {
              meetingId: data.meetingId,
              fileName: uploadResult.fileName,
              gcsPath: uploadResult.filePath,
              fileSize: buffer.length,
              duration: 0, // duration unknown at this stage — will be updated after transcription
              uploadedBy: data.hostUserId,
            },
          });

          await tx.meeting.update({
            where: { id: data.meetingId },
            data: { transcriptionStatus: TranscriptionStatus.UPLOADED },
          });

          return rec;
        },
        { timeout: 15000 },
      );

      // Queue transcription job — same pipeline as manual upload
      await getTranscriptionQueue().add(
        JobNames.TRANSCRIBE,
        { recordingId: recording.id, meetingId: data.meetingId },
        { jobId: `transcribe-${recording.id}` },
      );

      logger.info("Recall recording uploaded and transcription queued", {
        meetingId: data.meetingId,
        recordingId: recording.id,
      });
      return { success: true, recordingId: recording.id };
    } catch (err) {
      logger.error("Recall recording fetch job failed", {
        meetingId: data.meetingId,
        botId: data.botId,
        hostUserId: data.hostUserId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err; // re-throw so Bull marks the job as failed
    }
  });

  logger.info("Queue worker started successfully");
};

/**
 * Graceful shutdown
 */
export const stopWorker = async (): Promise<void> => {
  logger.info("Stopping queue worker...");
  await closeQueues();
  logger.info("Queue worker stopped");
};
