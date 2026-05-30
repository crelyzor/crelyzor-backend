/**
 * Phase 6 P6 — Public team routes. All endpoints are no-auth.
 *
 * Mounted under /api/v1/public via indexRouter.
 *
 * Routes:
 *   GET /teams/:slug                          — team profile + member roster
 *   GET /scheduling/team/:slug/profile        — bookable member list
 *   GET /scheduling/team/:slug/:username      — member's team-scoped event types
 */
import { Router } from "express";
import { apiLimiter } from "../utils/rateLimit/rateLimiter";
import * as publicTeamController from "../controllers/publicTeamController";

const publicTeamRouter = Router();

publicTeamRouter.get(
  "/teams/:slug",
  apiLimiter,
  publicTeamController.getTeamProfile,
);

publicTeamRouter.get(
  "/scheduling/team/:slug/profile",
  apiLimiter,
  publicTeamController.getTeamSchedulingProfile,
);

publicTeamRouter.get(
  "/scheduling/team/:slug/:username",
  apiLimiter,
  publicTeamController.getTeamMemberSchedulingProfile,
);

export default publicTeamRouter;
