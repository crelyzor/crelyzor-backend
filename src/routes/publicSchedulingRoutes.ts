import { Router } from "express";
import { apiLimiter } from "../utils/rateLimit/rateLimiter";
import * as publicSchedulingController from "../controllers/publicSchedulingController";

const publicSchedulingRouter = Router();

// All routes here are public — no auth required

/**
 * GET /api/v1/public/scheduling/profile/:username
 * Returns a user's scheduling profile and their active event types.
 * Used by the booking page to render the event type picker.
 */
publicSchedulingRouter.get(
  "/scheduling/profile/:username",
  apiLimiter,
  publicSchedulingController.getPublicSchedulingProfile,
);

/**
 * GET /api/v1/public/scheduling/slots/:username/:eventTypeSlug?date=YYYY-MM-DD
 * Returns available booking slots for a given host + event type + date.
 * All slot times are UTC ISO strings.
 */
publicSchedulingRouter.get(
  "/scheduling/slots/:username/:eventTypeSlug",
  apiLimiter,
  publicSchedulingController.getPublicSlots,
);

export default publicSchedulingRouter;
