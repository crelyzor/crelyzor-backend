import express from "express";
import { googleController } from "../controllers/googleController";
import {
  verifyJWT,
  verifyJWTFromQueryOrHeader,
} from "../middleware/authMiddleware";

const router = express.Router();

// 🔹 1. SIGN-IN WITH GOOGLE (no JWT needed)
router.get("/login", googleController.redirectToGoogleLogin);
router.get("/login/callback", googleController.handleGoogleLoginCallback);

// 🔹 2. CONNECT GOOGLE CALENDAR (JWT required - accepts from header or query param)
router.get(
  "/oauth",
  verifyJWTFromQueryOrHeader,
  googleController.redirectToGoogleCalendar,
);
router.get("/oauth/callback", googleController.handleGoogleCalendarCallback);

// 🔹 3. GET EVENTS BY DATE (JWT required)
router.post(
  "/calendar/events-by-date",
  verifyJWT,
  googleController.getEventsByDate,
);

// 🔹 4. CHECK CALENDAR ACCESS STATUS (JWT required)
router.get("/calendar/status", verifyJWT, googleController.checkCalendarAccess);

// 🔹 5. CHECK GOOGLE SCOPES STATUS (JWT required)
router.get("/scopes/status", verifyJWT, googleController.getScopesStatus);

// // 🔹 7. CALENDAR CRUD ROUTES (JWT required)
// router.post("/calendar/events", verifyJWT, googleController.createEvent);
// router.delete("/calendar/events/:id", verifyJWT, googleController.deleteEvent);

// 🔹 8. CALENDAR SYNC ROUTES (JWT required)
router.get(
  "/calendar/synced-events",
  verifyJWT,
  googleController.getSyncedEvents,
);
// Manual sync trigger
router.post("/calendar/sync", verifyJWT, googleController.triggerSync);

export default router;
