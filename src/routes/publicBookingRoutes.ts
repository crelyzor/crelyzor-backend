import { Router } from "express";
import { meetingController } from "../controllers/meetingController";

const publicBookingRouter = Router();

/**
 * GET /api/v1/public/booking/:shareToken
 * Get consultant profile and available slots (no auth required)
 */
publicBookingRouter.get("/booking/:shareToken", (req, res) =>
  meetingController.getPublicBookingProfile(req, res),
);

/**
 * POST /api/v1/public/booking/:shareToken/request
 * Guest requests meeting from consultant (no auth required)
 */
publicBookingRouter.post("/booking/:shareToken/request", (req, res) =>
  meetingController.requestMeetingPublic(req, res),
);

export default publicBookingRouter;
