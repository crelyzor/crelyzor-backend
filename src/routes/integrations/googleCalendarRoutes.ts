import { Router } from "express";
import { googleController } from "../../controllers/googleController";
import {
  verifyJWT,
  verifyJWTFromQueryOrHeader,
} from "../../middleware/authMiddleware";

const router = Router();

// 🔹 CONNECT GOOGLE CALENDAR (JWT required - accepts from header or query param)
router.get(
  "/connect",
  verifyJWTFromQueryOrHeader,
  googleController.redirectToGoogleCalendar,
);
router.get("/connect/callback", googleController.handleGoogleCalendarCallback);

// 🔹 CHECK CALENDAR ACCESS STATUS (JWT required)
router.get("/status", verifyJWT, googleController.checkCalendarAccess);

// 🔹 CHECK GOOGLE SCOPES STATUS (JWT required)
router.get("/scopes/status", verifyJWT, googleController.getScopesStatus);

// 🔹 GET EVENTS BY DATE (JWT required)
router.post("/events-by-date", verifyJWT, googleController.getEventsByDate);

// Note: Sync routes are handled by syncRouter mounted at /integrations/calendar/sync

export default router;
