import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as integrationController from "../controllers/integrationController";

const integrationRouter = Router();

integrationRouter.use(verifyJWT);

// ── Google Calendar ──────────────────────────────────────────────────────────
// 60 requests/hour — guards against exhausting per-user Google API quota
integrationRouter.get(
  "/google/events",
  userRateLimit(60, 60 * 60 * 1000, "gcal:events"),
  integrationController.getGoogleCalendarEvents,
);
integrationRouter.get(
  "/google/status",
  integrationController.getGoogleCalendarStatus,
);
integrationRouter.delete(
  "/google/disconnect",
  integrationController.disconnectGoogleCalendar,
);

// Phase 4.3: manual push channel backfill (called silently by frontend on Settings load)
integrationRouter.post(
  "/google/calendar/push/register",
  userRateLimit(5, 60 * 60 * 1000, "gcal:push-register"),
  integrationController.registerGCalPushChannel,
);

export default integrationRouter;
