import express, { Router } from "express";
import { recallWebhookLimiter } from "../utils/rateLimit/rateLimiter";
import { handleRecallWebhookSafe } from "../controllers/recallWebhookController";
import type { Request } from "express";

const recallWebhookRouter = Router();

/**
 * POST /webhooks/recall
 *
 * Raw body is captured here (scoped to this route only) for HMAC signature
 * verification. Do NOT register the global express.json() with verify — that
 * would attach rawBody buffers to every request and bloat memory.
 */
recallWebhookRouter.post(
  "/recall",
  express.json({
    verify: (req: Request, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  recallWebhookLimiter,
  handleRecallWebhookSafe,
);

export default recallWebhookRouter;
