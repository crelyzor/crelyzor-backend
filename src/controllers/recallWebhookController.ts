import crypto from "crypto";
import type { Request, Response } from "express";
import { MeetingStatus } from "@prisma/client";
import { apiResponse } from "../utils/globalResponseHandler";
import { logger } from "../utils/logging/logger";
import { recallWebhookSchema } from "../validators/recallSchema";
import { getRecallRecordingQueue, JobNames } from "../config/queue";
import prisma from "../db/prismaClient";

/**
 * POST /webhooks/recall
 *
 * Receives Recall.ai bot lifecycle events. No JWT — authorized via HMAC-SHA256
 * signature on the raw request body using RECALL_WEBHOOK_SECRET.
 *
 * Handles:
 *   - bot.status_change → update Meeting.status
 *   - done status         → queue recall-recording job
 */
export const handleRecallWebhook = async (req: Request, res: Response) => {
  // 1. HMAC signature verification — fail fast before any DB work
  const webhookSecret = process.env.RECALL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const standardWebhookId = req.headers["webhook-id"] as string | undefined;
    const standardWebhookSignature = req.headers["webhook-signature"] as string | undefined;
    const standardWebhookTimestamp = req.headers["webhook-timestamp"] as string | undefined;

    const hasStandardHeaders =
      !!standardWebhookId && !!standardWebhookSignature && !!standardWebhookTimestamp;

    if (hasStandardHeaders) {
      if (!req.rawBody) {
        logger.warn("Recall webhook rejected: rawBody not captured");
        return res.status(400).json({ error: "Could not verify request" });
      }

      const trusted = verifyStandardWebhookSignature(
        standardWebhookId,
        standardWebhookTimestamp,
        standardWebhookSignature,
        req.rawBody.toString("utf8"),
        webhookSecret,
      );

      if (!trusted) {
        logger.warn("Recall webhook rejected: invalid standard webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    } else {
    const signatureHeader =
      (req.headers["x-recallai-signature"] as string | undefined) ??
      (req.headers["x-recall-signature"] as string | undefined) ??
      (req.headers["x-recall-signature-256"] as string | undefined) ??
      (req.headers["recall-signature"] as string | undefined);

    const signature = extractHexSignature(signatureHeader);
    if (!signature) {
      if (process.env.NODE_ENV === "production") {
        logger.warn("Recall webhook rejected: missing signature header");
        return res.status(401).json({ error: "Missing signature" });
      }

      logger.warn("Recall webhook missing signature header — skipping verification in non-production", {
        headerKeys: Object.keys(req.headers || {}),
      });
    } else {
      if (!req.rawBody) {
        logger.warn("Recall webhook rejected: rawBody not captured");
        return res.status(400).json({ error: "Could not verify request" });
      }

      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(req.rawBody)
        .digest("hex");

      if (signature.length !== expected.length) {
        logger.warn("Recall webhook rejected: invalid signature length");
        return res.status(401).json({ error: "Invalid signature" });
      }

      const trusted = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex"),
      );

      if (!trusted) {
        logger.warn("Recall webhook rejected: invalid signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }
    }
  }

  // 2. Validate payload shape
  const parsed = recallWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn("Recall webhook rejected: invalid payload shape", { errors: parsed.error.issues });
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { event, data } = parsed.data;
  const botId = data.bot_id ?? data.bot?.id;
  const statusCode = data.status?.code ?? data.data?.code ?? inferStatusFromEvent(event);

  if (!botId) {
    logger.warn("Recall webhook rejected: missing bot identifier", { event, body: req.body });
    return res.status(400).json({ error: "Missing bot id" });
  }

  logger.info("Recall webhook received", { event, botId, statusCode });

  // 3. Look up meeting by botId
  const meeting = await prisma.meeting.findFirst({
    where: { recallBotId: botId, isDeleted: false },
    select: {
      id: true,
      createdById: true,
      createdBy: {
        select: {
          settings: {
            select: { recallEnabled: true },
          },
        },
      },
    },
  });

  if (!meeting) {
    // Recall may fire webhooks for bots from other environments — not an error
    logger.warn("Recall webhook: no meeting found for botId", { botId });
    return apiResponse(res, { statusCode: 200, message: "OK" });
  }

  // 4. Validate owner still has Recall enabled before processing
  if (!meeting.createdBy.settings?.recallEnabled) {
    logger.warn("Recall webhook: owner has Recall disabled — ignoring", {
      meetingId: meeting.id,
      botId,
    });
    return apiResponse(res, { statusCode: 200, message: "OK" });
  }

  // 5. Dispatch on event + status
  if (statusCode) {
    await handleStatusChange(meeting.id, statusCode, meeting.createdById, botId, event);
  }

  return apiResponse(res, { statusCode: 200, message: "OK" });
};

function extractHexSignature(signatureHeader?: string): string | undefined {
  if (!signatureHeader) return undefined;

  // Accept either raw hex signature or kv formats like: t=...,v1=<hex>
  const v1Match = signatureHeader.match(/(?:^|,)\s*v1=([a-fA-F0-9]+)\s*(?:,|$)/);
  if (v1Match?.[1]) return v1Match[1].toLowerCase();

  const cleaned = signatureHeader.replace(/^sha256=/i, "").trim();
  if (/^[a-fA-F0-9]+$/.test(cleaned)) return cleaned.toLowerCase();

  return undefined;
}

function inferStatusFromEvent(event: string): string | undefined {
  switch (event) {
    case "bot.done":
      return "done";
    case "bot.call_ended":
      return "call_ended";
    case "bot.fatal_error":
      return "fatal_error";
    default:
      return undefined;
  }
}

function verifyStandardWebhookSignature(
  webhookId: string,
  webhookTimestamp: string,
  webhookSignatureHeader: string,
  rawPayload: string,
  webhookSecret: string,
): boolean {
  // Standard Webhooks / Svix style: signed payload is "{id}.{timestamp}.{rawBody}".
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawPayload}`;

  // Recall-style secret is usually prefixed with "whsec_" and base64-encoded after the prefix.
  const encodedSecret = webhookSecret.startsWith("whsec_")
    ? webhookSecret.slice("whsec_".length)
    : webhookSecret;

  let secretBuffer: Buffer;
  try {
    secretBuffer = Buffer.from(encodedSecret, "base64");
  } catch {
    return false;
  }

  if (!secretBuffer.length) {
    return false;
  }

  const expectedBase64 = crypto
    .createHmac("sha256", secretBuffer)
    .update(signedContent)
    .digest("base64");

  const signatures = webhookSignatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [, value] = part.split(",", 2);
      return value?.trim();
    })
    .filter((value): value is string => !!value);

  return signatures.some((candidate) => {
    const candidateBuf = Buffer.from(candidate);
    const expectedBuf = Buffer.from(expectedBase64);

    if (candidateBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuf, expectedBuf);
  });
}

// Wrap the webhook handler in a top-level try/catch so unhandled errors
// still return HTTP 200 to Recall.ai (preventing infinite retries).
const _rawHandleRecallWebhook = handleRecallWebhook;
export const handleRecallWebhookSafe = async (req: import("express").Request, res: import("express").Response) => {
  try {
    await _rawHandleRecallWebhook(req, res);
  } catch (err) {
    logger.error("Recall webhook handler threw unexpectedly", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      body: req.body,
    });
    // Always 200 — Recall.ai should not retry for server-side errors
    if (!res.headersSent) {
      return apiResponse(res, { statusCode: 200, message: "OK" });
    }
  }
};

async function handleStatusChange(
  meetingId: string,
  statusCode: string,
  hostUserId: string,
  botId: string,
  event: string,
) {
  switch (statusCode) {
    case "joining_call":
    case "in_waiting_room":
    case "in_call_not_recording":
    case "in_call_recording":
      // Meeting schema has no IN_PROGRESS state — log only; status stays CREATED until done
      logger.info("Recall bot active in meeting", { meetingId, statusCode });
      break;

    case "processing":
      logger.info("Recall recording still processing", { meetingId, botId, event });
      break;

    case "done": {
      // Mark as completed when Recall reports done states.
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.COMPLETED },
      });

      // Queue fetch only when recording is actually reported done (or legacy status_change event).
      const shouldQueueRecording =
        event === "recording.done" || event === "bot.status_change";

      if (shouldQueueRecording) {
        await getRecallRecordingQueue().add(
          JobNames.FETCH_RECALL_RECORDING,
          { botId, meetingId, hostUserId },
          {
            jobId: `recall-recording-${meetingId}`,
            attempts: 8,
            backoff: { type: "exponential", delay: 30000 },
            delay: 90000, // Wait 90s before first attempt — Recall.ai needs time to make the URL available after recording.done
          },
        );

        logger.info("Meeting COMPLETED, Recall recording fetch queued", { meetingId, botId, event });
      } else {
        logger.info("Meeting COMPLETED from Recall done event (recording fetch deferred)", {
          meetingId,
          botId,
          event,
        });
      }
      break;
    }

    case "call_ended":
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.COMPLETED },
      });
      logger.info("Meeting marked COMPLETED via Recall webhook (call_ended)", { meetingId });
      break;

    case "fatal_error":
      logger.error("Recall bot fatal error", { meetingId, statusCode, botId });
      break;

    default:
      logger.info("Recall webhook: unhandled status code", { meetingId, statusCode });
  }
}
