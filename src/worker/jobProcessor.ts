import {
  getTranscriptionQueue,
  getAIProcessingQueue,
  closeQueues,
  TranscriptionJobData,
  AIProcessingJobData,
} from "../config/queue";
import { transcriptionService } from "../services/transcription/transcriptionService";
import { aiService } from "../services/ai/aiService";
import { logger } from "../utils/logging/logger";
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
      await transcriptionService.transcribeRecording(data.recordingId);

      // Get meeting to find owner for AI processing
      const meeting = await prisma.meeting.findUnique({
        where: { id: data.meetingId },
      });

      // Automatically queue AI processing after transcription
      const aiQueue = getAIProcessingQueue();
      await aiQueue.add("process-ai", {
        meetingId: data.meetingId,
        transcriptId: data.recordingId,
        ownerId: meeting?.createdById ?? "",
      });

      return { success: true };
    } catch (error) {
      logger.error("Transcription job failed:", {
        recordingId: data.recordingId,
        error: error instanceof Error ? error.message : String(error),
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
      });
      throw error;
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

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  await stopWorker();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await stopWorker();
  process.exit(0);
});
