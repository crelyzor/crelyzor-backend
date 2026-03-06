import { Router } from "express";
import { apiLimiter } from "../utils/rateLimit/rateLimiter";
import { getPublicMeeting } from "../controllers/shareController";

const publicMeetingRouter = Router();

// All routes here are public (no auth required)

/** GET /api/v1/public/meetings/:shortId — Fetch a published meeting by short ID */
publicMeetingRouter.get("/meetings/:shortId", apiLimiter, getPublicMeeting);

export default publicMeetingRouter;
