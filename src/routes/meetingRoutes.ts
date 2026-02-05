import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";
import { meetingController } from "../controllers/meetingController";

const router = Router();

/**
 * PUBLIC ROUTES (no authentication required)
 * Must be defined BEFORE auth middleware
 */

/**
 * POST /api/v1/meetings/:meetingId/guests/:guestEmail/accept
 * Guest accepts meeting invitation (public link - no auth required)
 */
router.post("/:meetingId/guests/:guestEmail/accept", (req, res) =>
  meetingController.respondToGuestInvitation(req, res),
);

/**
 * POST /api/v1/meetings/:meetingId/guests/:guestEmail/decline
 * Guest declines meeting invitation (public link - no auth required)
 */
router.post("/:meetingId/guests/:guestEmail/decline", (req, res) =>
  meetingController.respondToGuestInvitation(req, res),
);

// All other routes require authentication
router.use(verifyJWT);
router.use(resolveOrgContext);

/**
 * MEETING ROUTES (MANAGE_MEETING permission required)
 */

/**
 * GET /api/v1/meetings/without-pagination
 * Get meetings without pagination (max 1000 results for calendar view)
 */
router.get(
  "/without-pagination",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.getMeetingsWithoutPagination(req, res),
);

/**
 * POST /api/v1/meetings
 * Consultant creates meeting with assigned students (auto-accepted)
 */
router.post("/", requirePermission("MANAGE_MEETING"), (req, res) =>
  meetingController.createMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId
 * Update meeting details (title, description, time, participants, etc.)
 */
router.patch("/:meetingId", requirePermission("MANAGE_MEETING"), (req, res) =>
  meetingController.updateMeeting(req, res),
);

/**
 * POST /api/v1/meetings/request
 * Student requests meeting from consultant (pending acceptance)
 */
router.post("/request", requirePermission("MANAGE_MEETING"), (req, res) =>
  meetingController.requestMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/accept
 * Accept meeting request
 */
router.patch(
  "/:meetingId/accept",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.acceptMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/decline
 * Decline meeting request
 */
router.patch(
  "/:meetingId/decline",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.declineMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/cancel
 * Cancel meeting
 */
router.patch(
  "/:meetingId/cancel",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.cancelMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/complete
 * Mark meeting as completed
 */
router.patch(
  "/:meetingId/complete",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.completeMeeting(req, res),
);

/**
 * POST /api/v1/meetings/:meetingId/reschedule
 * Propose meeting reschedule
 */
router.post(
  "/:meetingId/reschedule",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.proposeReschedule(req, res),
);

/**
 * GET /api/v1/meetings/:meetingId/reschedule
 * Get pending reschedule requests for a meeting
 */
router.get(
  "/:meetingId/reschedule",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.getRescheduleRequests(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/reschedule/:requestId/respond
 * Accept or decline reschedule request
 */
router.patch(
  "/:meetingId/reschedule/:requestId/respond",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.respondToReschedule(req, res),
);

/**
 * GET /api/v1/meetings
 * Get meetings with filters
 */
router.get("/", requirePermission("MANAGE_MEETING"), (req, res) =>
  meetingController.getMeetings(req, res),
);

/**
 * GET /api/v1/meetings/:meetingId
 * Get single meeting details
 */
router.get("/:meetingId", requirePermission("MANAGE_MEETING"), (req, res) =>
  meetingController.getMeetingById(req, res),
);

/**
 * POST /api/v1/meetings/public-booking/generate
 * Generate public booking link
 */
router.post(
  "/public-booking/generate",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.generatePublicLink(req, res),
);

/**
 * GET /api/v1/meetings/public-booking/status
 * Get public booking status
 */
router.get(
  "/public-booking/status",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.getPublicBookingStatusHandler(req, res),
);

/**
 * POST /api/v1/meetings/public-booking/disable
 * Disable public booking
 */
router.post(
  "/public-booking/disable",
  requirePermission("MANAGE_MEETING"),
  (req, res) => meetingController.disablePublicBookingHandler(req, res),
);

export default router;
