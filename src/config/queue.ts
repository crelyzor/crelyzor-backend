import Bull from "bull";
import IORedis from "ioredis";
import { logger } from "../utils/logging/logger";

/**
 * Bull Queue Configuration
 * Manages job queues for async operations like transcription and AI processing
 */

export enum QueueNames {
  TRANSCRIPTION = "transcription",
  AI_PROCESSING = "ai-processing",
  RECALL_BOT_DEPLOY = "recall-bot-deploy",
  RECALL_RECORDING = "recall-recording",
  EMAIL = "email",
}

// Job name constants — must match exactly between .add() and .process() calls
export const JobNames = {
  TRANSCRIBE: "transcribe",
  PROCESS_AI: "process-ai",
  DEPLOY_RECALL_BOT: "deploy-bot",
  FETCH_RECALL_RECORDING: "fetch-recording",
  BOOKING_REMINDER: "booking-reminder",
  DAILY_TASK_DIGEST: "daily-task-digest",
  MONTHLY_USAGE_RESET: "monthly-usage-reset",
} as const;

// Job data interfaces
export interface TranscriptionJobData {
  recordingId: string;
  meetingId: string;
  language?: string; // BCP 47 code — optional, defaults to "en" in transcription service
}

export interface AIProcessingJobData {
  meetingId: string;
  transcriptId?: string;
  ownerId: string;
}

/** Job data for Recall.ai bot deployment. */
export interface RecallBotJobData {
  meetingId: string;
  hostUserId: string;
}

/** Job data for Recall.ai recording download + transcription pipeline. */
export interface RecallRecordingJobData {
  botId: string;
  meetingId: string;
  hostUserId: string;
}

/** Job data for booking reminder emails (delayed — fires 24h before meeting). */
export interface BookingReminderJobData {
  bookingId: string;
}

/** Job data for daily task digest (repeating cron). */
export interface DailyDigestJobData {
  /** Unused — cron job processes all opted-in users each time. */
  triggeredAt: string;
}

/** Job data for monthly usage reset cron. */
export interface MonthlyUsageResetJobData {
  /** Unused — cron job resets all users whose resetAt has passed. */
  triggeredAt: string;
}

// Queue instances
let transcriptionQueue: Bull.Queue<TranscriptionJobData> | null = null;
let aiProcessingQueue: Bull.Queue<AIProcessingJobData> | null = null;
let recallBotQueue: Bull.Queue<RecallBotJobData> | null = null;
let recallRecordingQueue: Bull.Queue<RecallRecordingJobData> | null = null;
let emailQueue: Bull.Queue<BookingReminderJobData | DailyDigestJobData> | null = null;

// Redis config optimized for Upstash
const getRedisConfig = () => ({
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: true,
  lazyConnect: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

/**
 * Initialize all queues - must be called before using any queue
 */
export const initializeQueues = async () => {
  const REDIS_URL = process.env.REDIS_URL;

  if (!REDIS_URL) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  try {
    const redisConfig = getRedisConfig();

    // Initialize Transcription Queue
    transcriptionQueue = new Bull<TranscriptionJobData>(
      QueueNames.TRANSCRIPTION,
      REDIS_URL,
      {
        settings: {
          maxStalledCount: 2,
          lockDuration: 30000,
          lockRenewTime: 15000,
        },
        createClient: () => new IORedis(REDIS_URL, redisConfig),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );

    // Initialize AI Processing Queue
    aiProcessingQueue = new Bull<AIProcessingJobData>(
      QueueNames.AI_PROCESSING,
      REDIS_URL,
      {
        settings: {
          maxStalledCount: 2,
          lockDuration: 60000,
          lockRenewTime: 30000,
        },
        createClient: () => new IORedis(REDIS_URL, redisConfig),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );

    // Initialize Recall Bot Deploy Queue
    recallBotQueue = new Bull<RecallBotJobData>(
      QueueNames.RECALL_BOT_DEPLOY,
      REDIS_URL,
      {
        settings: {
          maxStalledCount: 1,
          lockDuration: 30000,
          lockRenewTime: 15000,
        },
        createClient: () => new IORedis(REDIS_URL, redisConfig),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 10000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );

    // Initialize Recall Recording Queue
    recallRecordingQueue = new Bull<RecallRecordingJobData>(
      QueueNames.RECALL_RECORDING,
      REDIS_URL,
      {
        settings: {
          maxStalledCount: 1,
          lockDuration: 120000,
          lockRenewTime: 60000,
        },
        createClient: () => new IORedis(REDIS_URL, redisConfig),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 15000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );

    // Initialize Email Queue (reminders + daily digest)
    emailQueue = new Bull<BookingReminderJobData | DailyDigestJobData>(
      QueueNames.EMAIL,
      REDIS_URL,
      {
        settings: {
          maxStalledCount: 1,
          lockDuration: 60000,
          lockRenewTime: 30000,
        },
        createClient: () => new IORedis(REDIS_URL, redisConfig),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );

    // Wait for all queues to be ready
    await Promise.all([
      transcriptionQueue.isReady(),
      aiProcessingQueue.isReady(),
      recallBotQueue.isReady(),
      recallRecordingQueue.isReady(),
      emailQueue.isReady(),
    ]);

    logger.info("✅ Redis queues connected successfully");

    // Test connection with ping
    try {
      const pong = await transcriptionQueue.client.ping();
      logger.info(`📡 Redis ping: ${pong}`);
    } catch (pingError) {
      logger.warn("Redis ping test failed (non-critical)", {
        error: pingError instanceof Error ? pingError.message : String(pingError),
      });
    }

    // Setup event handlers
    setupQueueEvents(transcriptionQueue, "Transcription");
    setupQueueEvents(aiProcessingQueue, "AI Processing");
    setupQueueEvents(recallBotQueue, "Recall Bot Deploy");
    setupQueueEvents(recallRecordingQueue, "Recall Recording");
    setupQueueEvents(emailQueue, "Email");

    logger.info("📦 Queues initialized: transcription, ai-processing, recall-bot-deploy, recall-recording, email");

    return {
      transcriptionQueue,
      aiProcessingQueue,
      recallBotQueue,
      recallRecordingQueue,
      emailQueue,
    };
  } catch (error) {
    logger.error("Failed to initialize queues:", error);
    throw error;
  }
};

// Setup event handlers for a queue
const setupQueueEvents = (queue: Bull.Queue, name: string) => {
  queue.on("error", (err) => {
    logger.error(`${name} queue error:`, { error: err.message });
  });

  queue.on("failed", (job, err) => {
    logger.error(`${name} job ${job.id} failed:`, {
      jobData: job.data,
      error: err.message,
      stack: err.stack,
    });
  });

  queue.on("completed", (job) => {
    logger.info(`${name} job ${job.id} completed`);
  });
};

// Queue getters - throw if not initialized
export const getTranscriptionQueue = (): Bull.Queue<TranscriptionJobData> => {
  if (!transcriptionQueue) {
    throw new Error(
      "Transcription queue not initialized. Call initializeQueues() first.",
    );
  }
  return transcriptionQueue;
};

export const getAIProcessingQueue = (): Bull.Queue<AIProcessingJobData> => {
  if (!aiProcessingQueue) {
    throw new Error(
      "AI Processing queue not initialized. Call initializeQueues() first.",
    );
  }
  return aiProcessingQueue;
};

export const getRecallBotQueue = (): Bull.Queue<RecallBotJobData> => {
  if (!recallBotQueue) {
    throw new Error(
      "Recall Bot queue not initialized. Call initializeQueues() first.",
    );
  }
  return recallBotQueue;
};

export const getRecallRecordingQueue = (): Bull.Queue<RecallRecordingJobData> => {
  if (!recallRecordingQueue) {
    throw new Error(
      "Recall Recording queue not initialized. Call initializeQueues() first.",
    );
  }
  return recallRecordingQueue;
};

export const getEmailQueue = (): Bull.Queue<BookingReminderJobData | DailyDigestJobData> => {
  if (!emailQueue) {
    throw new Error(
      "Email queue not initialized. Call initializeQueues() first.",
    );
  }
  return emailQueue;
};

// Cleanup function for graceful shutdown
export const closeQueues = async (): Promise<void> => {
  try {
    const closePromises: Promise<void>[] = [];

    if (transcriptionQueue) {
      closePromises.push(transcriptionQueue.close());
      transcriptionQueue = null;
    }
    if (aiProcessingQueue) {
      closePromises.push(aiProcessingQueue.close());
      aiProcessingQueue = null;
    }
    if (recallBotQueue) {
      closePromises.push(recallBotQueue.close());
      recallBotQueue = null;
    }
    if (recallRecordingQueue) {
      closePromises.push(recallRecordingQueue.close());
      recallRecordingQueue = null;
    }
    if (emailQueue) {
      closePromises.push(emailQueue.close());
      emailQueue = null;
    }

    await Promise.all(closePromises);
    logger.info("All queues closed");
  } catch (error) {
    logger.error("Error closing queues:", error);
    throw error;
  }
};
