import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requireRole } from "../middleware/roleMiddleware";
import { UserRoleEnum } from "@prisma/client";
import { syncController } from "../controllers/syncController";

const syncRouter = Router();

// All routes require authentication
syncRouter.use(verifyJWT);
syncRouter.use(resolveOrgContext);

/**
 * POST /api/v1/sync/google-calendar
 * Manually trigger Google Calendar sync
 * Fetches all events from user's Google Calendar and syncs to DB
 * Authorization: All authenticated users (OWNER, ADMIN, MEMBER)
 */
syncRouter.post(
  "/google-calendar",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => syncController.syncGoogleCalendar(req, res),
);

/**
 * GET /api/v1/sync/status
 * Get current sync status
 * Shows when last sync occurred and if full sync is complete
 * Authorization: All authenticated users (OWNER, ADMIN, MEMBER)
 */
syncRouter.get("/status", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  syncController.getSyncStatus(req, res),
);

/**
 * GET /api/v1/sync/events
 * Get synced Google Calendar events with filters
 * Authorization: All authenticated users (OWNER, ADMIN, MEMBER)
 * Query params: startDate, endDate, limit, offset
 */
syncRouter.get("/events", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  syncController.getSyncedEvents(req, res),
);

/**
 * POST /api/v1/sync/link-event
 * Link a Google Calendar event to a Meeting in our DB
 * Authorization: All authenticated users (OWNER, ADMIN, MEMBER)
 */
syncRouter.post(
  "/link-event",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => syncController.linkEventToMeeting(req, res),
);

export default syncRouter;
