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
  GCAL_PUSH_SYNC: "gcal-push-sync",
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

/** Job data for GCal push-notification channel renewal cron. */
export interface GCalPushRenewalJobData {
  /** Unused — cron job processes all users with expiring channels. */
  triggeredAt: string;
}

/** Job data for a single GCal push-notification — queued by the webhook handler. */
export interface GCalPushSyncJobData {
  channelId: string;
}

// Queue instances
let transcriptionQueue: Bull.Queue<TranscriptionJobData> | null = null;
let aiProcessingQueue: Bull.Queue<AIProcessingJobData> | null = null;
let recallBotQueue: Bull.Queue<RecallBotJobData> | null = null;
let recallRecordingQueue: Bull.Queue<RecallRecordingJobData> | null = null;
let emailQueue: Bull.Queue<
  | BookingReminderJobData
  | DailyDigestJobData
  | MonthlyUsageResetJobData
  | GCalPushSyncJobData
  | GCalPushRenewalJobData
> | null = null;

// Shared Redis connection for producer-only mode (API server).
// All 5 queues reuse this single connection instead of creating 15.
let sharedProducerClient: IORedis | null = null;

// Redis connection config
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
 * Queue settings per queue name.
 * Keeps config DRY between producer and worker initialization.
 */
const queueSettings: Record<
  QueueNames,
  { settings: Bull.QueueOptions["settings"]; defaultJobOptions: Bull.JobOptions }
> = {
  [QueueNames.TRANSCRIPTION]: {
    settings: { maxStalledCount: 2, lockDuration: 30000, lockRenewTime: 15000 },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  [QueueNames.AI_PROCESSING]: {
    settings: { maxStalledCount: 2, lockDuration: 60000, lockRenewTime: 30000 },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  [QueueNames.RECALL_BOT_DEPLOY]: {
    settings: { maxStalledCount: 1, lockDuration: 30000, lockRenewTime: 15000 },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  [QueueNames.RECALL_RECORDING]: {
    settings: {
      maxStalledCount: 1,
      lockDuration: 120000,
      lockRenewTime: 60000,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 15000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  [QueueNames.EMAIL]: {
    settings: { maxStalledCount: 1, lockDuration: 60000, lockRenewTime: 30000 },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
};

/**
 * Initialize queues in producer-only mode for the API server.
 *
 * Bull creates 3 Redis connections per queue (client, subscriber, bclient).
 * In producer mode we only need to .add() jobs — never .process() them.
 * By sharing a single ioredis connection across all queues we go from
 * 15 persistent connections (all polling) down to 1 idle connection.
 *
 * This alone cuts Redis commands by ~70%.
 */
export const initializeProducerQueues = async () => {
  const REDIS_URL = process.env.REDIS_URL;

  if (!REDIS_URL) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  try {
    const redisConfig = getRedisConfig();
    sharedProducerClient = new IORedis(REDIS_URL, redisConfig);

    const createQueue = <T>(name: QueueNames): Bull.Queue<T> =>
      new Bull<T>(name, {
        createClient: () => sharedProducerClient!.duplicate(),
        ...queueSettings[name],
      });

    transcriptionQueue = createQueue<TranscriptionJobData>(
      QueueNames.TRANSCRIPTION,
    );
    aiProcessingQueue = createQueue<AIProcessingJobData>(
      QueueNames.AI_PROCESSING,
    );
    recallBotQueue = createQueue<RecallBotJobData>(QueueNames.RECALL_BOT_DEPLOY);
    recallRecordingQueue = createQueue<RecallRecordingJobData>(
      QueueNames.RECALL_RECORDING,
    );
    emailQueue = createQueue<
      | BookingReminderJobData
      | DailyDigestJobData
      | MonthlyUsageResetJobData
      | GCalPushSyncJobData
      | GCalPushRenewalJobData
    >(QueueNames.EMAIL);

    await Promise.all([
      transcriptionQueue.isReady(),
      aiProcessingQueue.isReady(),
      recallBotQueue.isReady(),
      recallRecordingQueue.isReady(),
      emailQueue.isReady(),
    ]);

    logger.info(
      "Producer queues initialized (shared connection, no polling)",
    );
  } catch (error) {
    logger.error("Failed to initialize producer queues:", error);
    throw error;
  }
};

/**
 * Initialize queues in worker mode — full connections with polling.
 * Only the worker process should call this.
 */
export const initializeQueues = async () => {
  const REDIS_URL = process.env.REDIS_URL;

  if (!REDIS_URL) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  try {
    const redisConfig = getRedisConfig();

    const createQueue = <T>(name: QueueNames): Bull.Queue<T> =>
      new Bull<T>(name, REDIS_URL, {
        createClient: () => new IORedis(REDIS_URL, redisConfig),
        ...queueSettings[name],
      });

    transcriptionQueue = createQueue<TranscriptionJobData>(
      QueueNames.TRANSCRIPTION,
    );
    aiProcessingQueue = createQueue<AIProcessingJobData>(
      QueueNames.AI_PROCESSING,
    );
    recallBotQueue = createQueue<RecallBotJobData>(QueueNames.RECALL_BOT_DEPLOY);
    recallRecordingQueue = createQueue<RecallRecordingJobData>(
      QueueNames.RECALL_RECORDING,
    );
    emailQueue = createQueue<
      | BookingReminderJobData
      | DailyDigestJobData
      | MonthlyUsageResetJobData
      | GCalPushSyncJobData
      | GCalPushRenewalJobData
    >(QueueNames.EMAIL);

    await Promise.all([
      transcriptionQueue.isReady(),
      aiProcessingQueue.isReady(),
      recallBotQueue.isReady(),
      recallRecordingQueue.isReady(),
      emailQueue.isReady(),
    ]);

    logger.info("Worker queues initialized (full connections)");

    // Setup event handlers (only needed in worker)
    setupQueueEvents(transcriptionQueue, "Transcription");
    setupQueueEvents(aiProcessingQueue, "AI Processing");
    setupQueueEvents(recallBotQueue, "Recall Bot Deploy");
    setupQueueEvents(recallRecordingQueue, "Recall Recording");
    setupQueueEvents(emailQueue, "Email");
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

export const getRecallRecordingQueue =
  (): Bull.Queue<RecallRecordingJobData> => {
    if (!recallRecordingQueue) {
      throw new Error(
        "Recall Recording queue not initialized. Call initializeQueues() first.",
      );
    }
    return recallRecordingQueue;
  };

export const getEmailQueue = (): Bull.Queue<
  | BookingReminderJobData
  | DailyDigestJobData
  | MonthlyUsageResetJobData
  | GCalPushSyncJobData
  | GCalPushRenewalJobData
> => {
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

    if (sharedProducerClient) {
      sharedProducerClient.disconnect();
      sharedProducerClient = null;
    }

    logger.info("All queues closed");
  } catch (error) {
    logger.error("Error closing queues:", error);
    throw error;
  }
};
