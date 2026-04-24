import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getEmailQueue, JobNames } from "../config/queue";
import { logger } from "../utils/logging/logger";

const googleWebhookRouter = Router();

const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  skip: () => false,
});

/**
 * POST /webhooks/google/calendar
 *
 * Public endpoint — Google sends push notifications here when any calendar event changes.
 * Always returns 200 synchronously (Google retries on non-2xx).
 *
 * Security:
 *   - X-Goog-Channel-Token must match GCAL_WEBHOOK_SECRET
 *   - X-Goog-Resource-State === "sync" is the initial handshake — respond 200 and return
 *
 * Processing:
 *   - Queues a Bull job "gcal-push-sync" with { channelId } and immediately responds 200
 */
googleWebhookRouter.post(
  "/google/calendar",
  webhookRateLimit,
  async (req, res) => {
    res.status(200).end(); // Always respond immediately — never let Google wait

    const token = req.headers["x-goog-channel-token"] as string | undefined;
    const channelId = req.headers["x-goog-channel-id"] as string | undefined;
    const resourceState = req.headers["x-goog-resource-state"] as
      | string
      | undefined;

    // Verify shared secret
    const secret = process.env.GCAL_WEBHOOK_SECRET;
    if (!secret || token !== secret) {
      logger.warn("GCal webhook: token mismatch — ignoring", {
        tokenPresent: !!token,
      });
      return;
    }

    // Initial handshake from Google — nothing to process
    if (resourceState === "sync") {
      logger.info("GCal webhook: initial sync handshake received", {
        channelId,
      });
      return;
    }

    if (!channelId) {
      logger.warn("GCal webhook: missing X-Goog-Channel-ID — ignoring");
      return;
    }

    // Queue the work — we never block the webhook response on DB access
    try {
      const emailQueue = getEmailQueue();
      await emailQueue.add(
        JobNames.GCAL_PUSH_SYNC,
        { channelId },
        { attempts: 1, removeOnComplete: true, removeOnFail: false },
      );
    } catch (err) {
      logger.error("GCal webhook: failed to queue job", {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

export default googleWebhookRouter;
