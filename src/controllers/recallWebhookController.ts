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
    const signature = req.headers["x-recallai-signature"] as string | undefined;
    if (!signature) {
      logger.warn("Recall webhook rejected: missing signature header");
      return res.status(401).json({ error: "Missing signature" });
    }

    if (!req.rawBody) {
      logger.warn("Recall webhook rejected: rawBody not captured");
      return res.status(400).json({ error: "Could not verify request" });
    }

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    const trusted = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );

    if (!trusted) {
      logger.warn("Recall webhook rejected: invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  // 2. Validate payload shape
  const parsed = recallWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn("Recall webhook rejected: invalid payload shape", { errors: parsed.error.issues });
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { event, data } = parsed.data;
  const botId = data.bot_id;
  const statusCode = data.status?.code;

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
  if (event === "bot.status_change" && statusCode) {
    await handleStatusChange(meeting.id, statusCode, meeting.createdById, botId);
  }

  return apiResponse(res, { statusCode: 200, message: "OK" });
};

async function handleStatusChange(
  meetingId: string,
  statusCode: string,
  hostUserId: string,
  botId: string,
) {
  switch (statusCode) {
    case "in_waiting_room":
    case "in_call_not_recording":
    case "in_call_recording":
      // Meeting schema has no IN_PROGRESS state — log only; status stays CREATED until done
      logger.info("Recall bot active in meeting", { meetingId, statusCode });
      break;

    case "done": {
      // Bot has left and recording is available — queue download + transcription pipeline
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.COMPLETED },
      });

      await getRecallRecordingQueue().add(
        JobNames.FETCH_RECALL_RECORDING,
        { botId, meetingId, hostUserId },
        { jobId: `recall-recording-${meetingId}` },
      );

      logger.info("Meeting COMPLETED, Recall recording fetch queued", { meetingId, botId });
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
