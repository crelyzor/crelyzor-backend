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
}

// Job data interfaces
export interface TranscriptionJobData {
  recordingId: string;
  meetingId: string;
}

export interface AIProcessingJobData {
  meetingId: string;
  transcriptId?: string;
  ownerId: string;
}

// Queue instances
let transcriptionQueue: Bull.Queue<TranscriptionJobData> | null = null;
let aiProcessingQueue: Bull.Queue<AIProcessingJobData> | null = null;

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

    // Wait for all queues to be ready
    await Promise.all([
      transcriptionQueue.isReady(),
      aiProcessingQueue.isReady(),
    ]);

    logger.info("✅ Redis queues connected successfully");

    // Test connection with ping
    try {
      const pong = await transcriptionQueue.client.ping();
      logger.info(`📡 Redis ping: ${pong}`);
    } catch (pingError) {
      logger.warn("Redis ping test failed (non-critical):", pingError);
    }

    // Setup event handlers
    setupQueueEvents(transcriptionQueue, "Transcription");
    setupQueueEvents(aiProcessingQueue, "AI Processing");

    logger.info("📦 Queues initialized: transcription, ai-processing");

    return {
      transcriptionQueue,
      aiProcessingQueue,
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

    await Promise.all(closePromises);
    logger.info("All queues closed");
  } catch (error) {
    logger.error("Error closing queues:", error);
    throw error;
  }
};
