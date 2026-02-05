import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";
import { syncController } from "../controllers/syncController";

const syncRouter = Router();

// All routes require authentication
syncRouter.use(verifyJWT);
syncRouter.use(resolveOrgContext);

/**
 * POST /api/v1/sync/google-calendar
 * Manually trigger Google Calendar sync
 * Fetches all events from user's Google Calendar and syncs to DB
 * Requires: MANAGE_MEETING permission
 */
syncRouter.post(
  "/google-calendar",
  requirePermission("MANAGE_MEETING"),
  (req, res) => syncController.syncGoogleCalendar(req, res),
);

/**
 * GET /api/v1/sync/status
 * Get current sync status
 * Shows when last sync occurred and if full sync is complete
 * Requires: MANAGE_MEETING permission
 */
syncRouter.get("/status", requirePermission("MANAGE_MEETING"), (req, res) =>
  syncController.getSyncStatus(req, res),
);

/**
 * GET /api/v1/sync/events
 * Get synced Google Calendar events with filters
 * Requires: MANAGE_MEETING permission
 * Query params: startDate, endDate, limit, offset
 */
syncRouter.get("/events", requirePermission("MANAGE_MEETING"), (req, res) =>
  syncController.getSyncedEvents(req, res),
);

/**
 * POST /api/v1/sync/link-event
 * Link a Google Calendar event to a Meeting in our DB
 * Requires: MANAGE_MEETING permission
 */
syncRouter.post(
  "/link-event",
  requirePermission("MANAGE_MEETING"),
  (req, res) => syncController.linkEventToMeeting(req, res),
);

export default syncRouter;
