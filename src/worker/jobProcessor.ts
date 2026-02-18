import {
  getTranscriptionQueue,
  getAIProcessingQueue,
  getNotificationQueue,
  closeQueues,
} from "../config/queue";
import { transcriptionService } from "../services/transcription/transcriptionService";
import { aiService } from "../services/ai/aiService";
import {
  notificationService,
  SendEmailInput,
} from "../services/notifications/notificationService";
import { logger } from "../utils/logging/logger";
import prisma from "../db/prismaClient";

interface TranscriptionJobData {
  recordingId: string;
  meetingId: string;
}

interface AIProcessingJobData {
  meetingId: string;
  transcriptId: string;
  ownerId: string;
}

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
        include: {
          createdByMember: {
            include: { user: true },
          },
        },
      });

      // Automatically queue AI processing after transcription
      const aiQueue = getAIProcessingQueue();
      await aiQueue.add("process-ai", {
        meetingId: data.meetingId,
        transcriptId: data.recordingId,
        ownerId: meeting?.createdByMember?.userId || "",
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

      // Send notification that transcription and AI processing is complete
      const meeting = await prisma.meeting.findUnique({
        where: { id: data.meetingId },
        include: {
          createdByMember: {
            include: { user: true },
          },
        },
      });

      const userEmail = meeting?.createdByMember?.user?.email;
      if (userEmail) {
        await notificationService.sendTranscriptionReady(
          userEmail,
          {
            meetingTitle: meeting.title,
            actionUrl: `${process.env.FRONTEND_URL}/meetings/${meeting.id}`,
          },
          meeting.organizationId,
        );
      }

      return { success: true, result };
    } catch (error) {
      logger.error("AI processing job failed:", {
        meetingId: data.meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  // Notification queue processor
  const notificationQueue = getNotificationQueue();
  notificationQueue.process("send-email", async (job) => {
    const data = job.data as SendEmailInput;
    logger.info(
      `Processing email notification to ${Array.isArray(data.to) ? data.to.join(", ") : data.to}`,
    );

    try {
      const result = await notificationService.sendEmail(data);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      logger.error("Email notification job failed:", {
        to: data.to,
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
