import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requireRole } from "../middleware/roleMiddleware";
import { UserRoleEnum } from "@prisma/client";
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
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.getMeetingsWithoutPagination(req, res),
);

/**
 * POST /api/v1/meetings
 * Consultant creates meeting with assigned students (auto-accepted)
 */
router.post("/", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  meetingController.createMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId
 * Update meeting details (title, description, time, participants, etc.)
 */
router.patch("/:meetingId", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  meetingController.updateMeeting(req, res),
);

/**
 * POST /api/v1/meetings/request
 * Student requests meeting from consultant (pending acceptance)
 */
router.post("/request", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  meetingController.requestMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/accept
 * Accept meeting request
 */
router.patch(
  "/:meetingId/accept",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.acceptMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/decline
 * Decline meeting request
 */
router.patch(
  "/:meetingId/decline",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.declineMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/cancel
 * Cancel meeting
 */
router.patch(
  "/:meetingId/cancel",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.cancelMeeting(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/complete
 * Mark meeting as completed
 */
router.patch(
  "/:meetingId/complete",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.completeMeeting(req, res),
);

/**
 * POST /api/v1/meetings/:meetingId/reschedule
 * Propose meeting reschedule
 */
router.post(
  "/:meetingId/reschedule",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.proposeReschedule(req, res),
);

/**
 * GET /api/v1/meetings/:meetingId/reschedule
 * Get pending reschedule requests for a meeting
 */
router.get(
  "/:meetingId/reschedule",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.getRescheduleRequests(req, res),
);

/**
 * PATCH /api/v1/meetings/:meetingId/reschedule/:requestId/respond
 * Accept or decline reschedule request
 */
router.patch(
  "/:meetingId/reschedule/:requestId/respond",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.respondToReschedule(req, res),
);

/**
 * GET /api/v1/meetings
 * Get meetings with filters
 */
router.get("/", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  meetingController.getMeetings(req, res),
);

/**
 * GET /api/v1/meetings/:meetingId
 * Get single meeting details
 */
router.get("/:meetingId", requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]), (req, res) =>
  meetingController.getMeetingById(req, res),
);

/**
 * POST /api/v1/meetings/public-booking/generate
 * Generate public booking link
 */
router.post(
  "/public-booking/generate",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.generatePublicLink(req, res),
);

/**
 * GET /api/v1/meetings/public-booking/status
 * Get public booking status
 */
router.get(
  "/public-booking/status",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.getPublicBookingStatusHandler(req, res),
);

/**
 * POST /api/v1/meetings/public-booking/disable
 * Disable public booking
 */
router.post(
  "/public-booking/disable",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  (req, res) => meetingController.disablePublicBookingHandler(req, res),
);

export default router;
