import {
  getTranscriptionQueue,
  getAIProcessingQueue,
  getRecallBotQueue,
  getRecallRecordingQueue,
  getEmailQueue,
  closeQueues,
  JobNames,
  TranscriptionJobData,
  AIProcessingJobData,
  RecallBotJobData,
  RecallRecordingJobData,
  BookingReminderJobData,
  DailyDigestJobData,
  MonthlyUsageResetJobData,
} from "../config/queue";
import { transcriptionService } from "../services/transcription/transcriptionService";
import { aiService } from "../services/ai/aiService";
import { sendEmail } from "../services/email/emailService";
import { meetingReadyEmail, meetingReadySubject } from "../services/email/templates/meetingReady";
import { bookingReminderEmail, bookingReminderSubject } from "../services/email/templates/bookingReminder";
import { dailyDigestEmail, dailyDigestSubject } from "../services/email/templates/dailyDigest";
import { deployBot, getBotRecordingInfo } from "../services/recall/recallService";
import { checkRecall, deductRecall, runMonthlyReset } from "../services/billing/usageService";
import { gcsService } from "../services/gcs/gcsService";
import { logger } from "../utils/logging/logger";
import { TranscriptionStatus } from "@prisma/client";
import prisma from "../db/prismaClient";
import { isVideoMeetingUrl } from "../utils/isVideoMeetingUrl";

/** Base URL for the dashboard app — used in email CTAs */
const APP_BASE_URL = process.env.FRONTEND_URL ?? "https://app.crelyzor.com";
/** Base URL for public-facing links */
const PUBLIC_BASE_URL = process.env.PUBLIC_URL ?? "https://crelyzor.com";

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

      // Email notification: Meeting Ready
      const [meeting, user] = await Promise.all([
        prisma.meeting.findUnique({ where: { id: data.meetingId }, select: { title: true } }),
        prisma.user.findUnique({
          where: { id: data.ownerId },
          select: { name: true, email: true, settings: { select: { emailNotificationsEnabled: true, meetingReadyEmailEnabled: true } } }
        }),
      ]);

      const emailsEnabled =
        (user?.settings?.emailNotificationsEnabled ?? true) &&
        (user?.settings?.meetingReadyEmailEnabled ?? true);

      if (emailsEnabled && user?.email && meeting?.title) {
        await sendEmail({
          to: user.email,
          subject: meetingReadySubject({ meetingTitle: meeting.title }),
          html: meetingReadyEmail({
            userName: user.name ?? "there",
            meetingTitle: meeting.title,
            meetingId: data.meetingId,
            appBaseUrl: APP_BASE_URL,
          }),
        });
      }

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
            location: true,
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
      // Meeting link can come from booking event type, Meet link, or location field
      const meetingLink = meeting.booking?.eventType?.meetingLink ?? meeting.meetLink ?? meeting.location;
      if (!meetingLink || !isVideoMeetingUrl(meetingLink)) {
        logger.warn("Meeting has no valid video meeting URL — skipping bot deploy", {
          meetingId: data.meetingId,
        });
        return { skipped: true };
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

      // Recall usage check — estimate 1 hr per session. Throws 402 if over limit.
      // Fail-open: if check itself errors unexpectedly, let the job continue.
      try {
        await checkRecall(data.hostUserId, 1);
      } catch (usageErr: unknown) {
        if (usageErr instanceof Error && usageErr.message === "RECALL_LIMIT_REACHED") {
          logger.warn("Recall limit reached — skipping bot deploy", { meetingId: data.meetingId, hostUserId: data.hostUserId });
          return { skipped: true, reason: "recall_limit_reached" };
        }
        logger.error("Recall usage check error (non-fatal, continuing deploy)", {
          error: usageErr instanceof Error ? usageErr.message : String(usageErr),
        });
      }

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
      // Fetch recording download URL from bot details
      const { url: downloadUrl } = await getBotRecordingInfo(data.botId);

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

      // Deduct Recall hours based on actual recording duration (fail-open).
      // Duration is unknown at this stage; use 1 hr as a conservative deduction.
      // TODO Phase 5: use actual bot duration from Recall API when available.
      await deductRecall(data.hostUserId, 1);

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

  // Email Queue processor
  const emailQueue = getEmailQueue();
  emailQueue.process(JobNames.BOOKING_REMINDER, async (job) => {
    const { bookingId } = job.data as BookingReminderJobData;
    logger.info("Processing booking reminder email job", { jobId: job.id, bookingId });

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        timezone: true,
        guestName: true,
        guestEmail: true,
        userId: true,
        eventType: { select: { title: true } },
        meeting: {
          select: {
            meetLink: true,
            location: true,
            booking: { select: { eventType: { select: { meetingLink: true } } } },
          },
        },
      },
    });

    if (!booking || booking.status !== "CONFIRMED") {
      logger.info("Booking reminder skipped: not found or not confirmed", { bookingId });
      return { skipped: true };
    }

    const host = await prisma.user.findUnique({
      where: { id: booking.userId },
      select: {
        name: true,
        email: true,
        settings: { select: { emailNotificationsEnabled: true, bookingEmailsEnabled: true } },
      },
    });

    const emailsEnabled =
      (host?.settings?.emailNotificationsEnabled ?? true) &&
      (host?.settings?.bookingEmailsEnabled ?? true);

    if (!emailsEnabled) {
      return { skipped: true };
    }

    const meetingLink =
      booking.meeting?.booking?.eventType?.meetingLink ??
      booking.meeting?.meetLink ??
      booking.meeting?.location;

    const sharedParams = {
      eventTypeTitle: booking.eventType.title,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      meetingLink,
    };

    await Promise.all([
      host?.email
        ? sendEmail({
            to: host.email,
            subject: bookingReminderSubject({
              eventTypeTitle: booking.eventType.title,
              otherPartyName: booking.guestName,
            }),
            html: bookingReminderEmail({
              recipientName: host?.name ?? "Host",
              otherPartyName: booking.guestName,
              role: "host",
              ...sharedParams,
            }),
          })
        : Promise.resolve(),
      sendEmail({
        to: booking.guestEmail,
        subject: bookingReminderSubject({
          eventTypeTitle: booking.eventType.title,
          otherPartyName: host?.name ?? "Host",
        }),
        html: bookingReminderEmail({
          recipientName: booking.guestName,
          otherPartyName: host?.name ?? "Host",
          role: "guest",
          ...sharedParams,
        }),
      }),
    ]);

    return { success: true };
  });

  emailQueue.process(JobNames.DAILY_TASK_DIGEST, async (job) => {
    logger.info("Processing daily task digest email job", { jobId: job.id });

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        settings: {
          emailNotificationsEnabled: true,
          dailyDigestEnabled: true,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        timezone: true,
        tasks: {
          where: { isDeleted: false, status: { not: "DONE" } },
          select: { title: true, priority: true, dueDate: true },
        },
      },
    });

    logger.info(`Sending daily digest to ${users.length} users`);

    for (const user of users) {
      if (!user.email) continue;

      const now = new Date();
      const userNow = new Date(now.toLocaleString("en-US", { timeZone: user.timezone }));
      userNow.setHours(0, 0, 0, 0);

      const overdueTasks: any[] = [];
      const todayTasks: any[] = [];

      user.tasks.forEach((task) => {
        if (!task.dueDate) return;
        const taskDate = new Date(task.dueDate);
        const userTaskDate = new Date(taskDate.toLocaleString("en-US", { timeZone: user.timezone }));
        userTaskDate.setHours(0, 0, 0, 0);

        const isOverdue = userTaskDate < userNow;
        const isToday = userTaskDate.getTime() === userNow.getTime();

        const digestTask = {
          title: task.title,
          priority: task.priority,
          dueDate: task.dueDate,
          isOverdue,
        };

        if (isOverdue) overdueTasks.push(digestTask);
        if (isToday) todayTasks.push(digestTask);
      });

      if (overdueTasks.length > 0 || todayTasks.length > 0) {
        await sendEmail({
          to: user.email,
          subject: dailyDigestSubject({ overdueTasks, todayTasks }),
          html: dailyDigestEmail({
            userName: user.name,
            overdueTasks,
            todayTasks,
            appBaseUrl: APP_BASE_URL,
          }),
        });
      }
    }

    return { success: true, count: users.length };
  });

  // Schedule daily task digest cron job (08:00 UTC every day)
  try {
    await emailQueue.add(
      JobNames.DAILY_TASK_DIGEST,
      { triggeredAt: new Date().toISOString() },
      { repeat: { cron: "0 8 * * *" }, jobId: "daily-digest-cron" }
    );
    logger.info("Daily task digest cron scheduled for 08:00 UTC");
  } catch (err) {
    logger.error("Failed to schedule daily task digest cron", { 
      error: err instanceof Error ? err.message : String(err) 
    });
  }

  // Monthly usage reset processor
  emailQueue.process(JobNames.MONTHLY_USAGE_RESET, async (job) => {
    const data = job.data as MonthlyUsageResetJobData;
    logger.info("Processing monthly usage reset job", { triggeredAt: data.triggeredAt });
    try {
      const count = await runMonthlyReset();
      return { success: true, usersReset: count };
    } catch (err) {
      logger.error("Monthly usage reset job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  // Schedule monthly usage reset cron (midnight on 1st of every month UTC)
  try {
    await emailQueue.add(
      JobNames.MONTHLY_USAGE_RESET,
      { triggeredAt: new Date().toISOString() },
      { repeat: { cron: "0 0 1 * *" }, jobId: "monthly-usage-reset-cron" }
    );
    logger.info("Monthly usage reset cron scheduled for 00:00 UTC on 1st of each month");
  } catch (err) {
    logger.error("Failed to schedule monthly usage reset cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
