import Bull from "bull";
import IORedis from "ioredis";
import { logger } from "../utils/logging/logger";

/**
 * Bull Queue Configuration
 *
 * Single queue ("crelyzor") with job-name-based routing.
 * Worker connections: 3 (client + subscriber + bclient).
 * Producer connections: 1 shared ioredis (no polling).
 */

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

// ── Job data interfaces ──────────────────────────────────────────────────────

export interface TranscriptionJobData {
  recordingId: string;
  meetingId: string;
  language?: string;
}

export interface AIProcessingJobData {
  meetingId: string;
  transcriptId?: string;
  ownerId: string;
}

export interface RecallBotJobData {
  meetingId: string;
  hostUserId: string;
}

export interface RecallRecordingJobData {
  botId: string;
  meetingId: string;
  hostUserId: string;
}

export interface BookingReminderJobData {
  bookingId: string;
}

export interface DailyDigestJobData {
  triggeredAt: string;
}

export interface MonthlyUsageResetJobData {
  triggeredAt: string;
}

export interface GCalPushRenewalJobData {
  triggeredAt: string;
}

export interface GCalPushSyncJobData {
  channelId: string;
}

// Union of all job data types
type AnyJobData =
  | TranscriptionJobData
  | AIProcessingJobData
  | RecallBotJobData
  | RecallRecordingJobData
  | BookingReminderJobData
  | DailyDigestJobData
  | MonthlyUsageResetJobData
  | GCalPushRenewalJobData
  | GCalPushSyncJobData;

// ── Queue instance ───────────────────────────────────────────────────────────

const QUEUE_NAME = "crelyzor";
let queue: Bull.Queue<AnyJobData> | null = null;
let sharedProducerClient: IORedis | null = null;

const getRedisConfig = () => ({
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: true,
  lazyConnect: false,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

/**
 * Initialize queue in producer-only mode for the API server.
 * Uses a single shared ioredis connection — no polling, no subscriber.
 */
export const initializeProducerQueues = async () => {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) throw new Error("REDIS_URL environment variable is not set");

  try {
    const redisConfig = getRedisConfig();
    sharedProducerClient = new IORedis(REDIS_URL, redisConfig);

    queue = new Bull<AnyJobData>(QUEUE_NAME, {
      createClient: () => sharedProducerClient!.duplicate(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    await queue.isReady();
    logger.info("Producer queue initialized (shared connection, no polling)");
  } catch (error) {
    logger.error("Failed to initialize producer queue:", error);
    throw error;
  }
};

/**
 * Initialize queue in worker mode — full connections with polling.
 * Only the worker process should call this.
 */
export const initializeQueues = async () => {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) throw new Error("REDIS_URL environment variable is not set");

  try {
    const redisConfig = getRedisConfig();

    queue = new Bull<AnyJobData>(QUEUE_NAME, REDIS_URL, {
      createClient: () => new IORedis(REDIS_URL, redisConfig),
      settings: {
        maxStalledCount: 2,
        lockDuration: 120000,
        lockRenewTime: 60000,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    await queue.isReady();

    queue.on("error", (err) => {
      logger.error("Queue error:", { error: err.message });
    });
    queue.on("failed", (job, err) => {
      logger.error(`Job ${job.name} (${job.id}) failed:`, {
        jobData: job.data,
        error: err.message,
        stack: err.stack,
      });
    });
    queue.on("completed", (job) => {
      logger.info(`Job ${job.name} (${job.id}) completed`);
    });

    logger.info("Worker queue initialized (full connections)");
  } catch (error) {
    logger.error("Failed to initialize queue:", error);
    throw error;
  }
};

// ── Queue getters ────────────────────────────────────────────────────────────
// All return the same single queue. Callers use JobNames to differentiate.
// Typed generics preserved so callers don't need to change.

const getQueue = (): Bull.Queue<AnyJobData> => {
  if (!queue) {
    throw new Error(
      "Queue not initialized. Call initializeQueues() or initializeProducerQueues() first.",
    );
  }
  return queue;
};

export const getTranscriptionQueue = (): Bull.Queue<TranscriptionJobData> =>
  getQueue() as unknown as Bull.Queue<TranscriptionJobData>;

export const getAIProcessingQueue = (): Bull.Queue<AIProcessingJobData> =>
  getQueue() as unknown as Bull.Queue<AIProcessingJobData>;

export const getRecallBotQueue = (): Bull.Queue<RecallBotJobData> =>
  getQueue() as unknown as Bull.Queue<RecallBotJobData>;

export const getRecallRecordingQueue = (): Bull.Queue<RecallRecordingJobData> =>
  getQueue() as unknown as Bull.Queue<RecallRecordingJobData>;

export const getEmailQueue = (): Bull.Queue<
  | BookingReminderJobData
  | DailyDigestJobData
  | MonthlyUsageResetJobData
  | GCalPushSyncJobData
  | GCalPushRenewalJobData
> =>
  getQueue() as unknown as Bull.Queue<
    | BookingReminderJobData
    | DailyDigestJobData
    | MonthlyUsageResetJobData
    | GCalPushSyncJobData
    | GCalPushRenewalJobData
  >;

// ── Cleanup ──────────────────────────────────────────────────────────────────

export const closeQueues = async (): Promise<void> => {
  try {
    if (queue) {
      await queue.close();
      queue = null;
    }
    if (sharedProducerClient) {
      sharedProducerClient.disconnect();
      sharedProducerClient = null;
    }
    logger.info("Queue closed");
  } catch (error) {
    logger.error("Error closing queue:", error);
    throw error;
  }
};
