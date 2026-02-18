import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { meetingController } from "../controllers/meetingController";

const router = Router();

// ========================================
// PUBLIC ROUTES (no auth required)
// ========================================

/** Guest accepts meeting invitation */
router.post("/:meetingId/guests/:guestEmail/accept", (req, res) =>
  meetingController.respondToGuestInvitation(req, res),
);

/** Guest declines meeting invitation */
router.post("/:meetingId/guests/:guestEmail/decline", (req, res) =>
  meetingController.respondToGuestInvitation(req, res),
);

// ========================================
// AUTHENTICATED ROUTES (JWT only, no org context)
// ========================================
router.use(verifyJWT);

/** GET /api/v1/meetings/without-pagination — calendar view */
router.get("/without-pagination", (req, res) =>
  meetingController.getMeetingsWithoutPagination(req, res),
);

/** POST /api/v1/meetings — create meeting */
router.post("/", (req, res) => meetingController.createMeeting(req, res));

/** PATCH /api/v1/meetings/:meetingId — update meeting */
router.patch("/:meetingId", (req, res) =>
  meetingController.updateMeeting(req, res),
);

/** POST /api/v1/meetings/request — request meeting from another user */
router.post("/request", (req, res) =>
  meetingController.requestMeeting(req, res),
);

/** PATCH /api/v1/meetings/:meetingId/accept */
router.patch("/:meetingId/accept", (req, res) =>
  meetingController.acceptMeeting(req, res),
);

/** PATCH /api/v1/meetings/:meetingId/decline */
router.patch("/:meetingId/decline", (req, res) =>
  meetingController.declineMeeting(req, res),
);

/** PATCH /api/v1/meetings/:meetingId/cancel */
router.patch("/:meetingId/cancel", (req, res) =>
  meetingController.cancelMeeting(req, res),
);

/** PATCH /api/v1/meetings/:meetingId/complete */
router.patch("/:meetingId/complete", (req, res) =>
  meetingController.completeMeeting(req, res),
);

/** POST /api/v1/meetings/:meetingId/reschedule */
router.post("/:meetingId/reschedule", (req, res) =>
  meetingController.proposeReschedule(req, res),
);

/** GET /api/v1/meetings/:meetingId/reschedule */
router.get("/:meetingId/reschedule", (req, res) =>
  meetingController.getRescheduleRequests(req, res),
);

/** PATCH /api/v1/meetings/:meetingId/reschedule/:requestId/respond */
router.patch("/:meetingId/reschedule/:requestId/respond", (req, res) =>
  meetingController.respondToReschedule(req, res),
);

/** GET /api/v1/meetings — get meetings with filters */
router.get("/", (req, res) => meetingController.getMeetings(req, res));

/** GET /api/v1/meetings/:meetingId — get single meeting */
router.get("/:meetingId", (req, res) =>
  meetingController.getMeetingById(req, res),
);

export default router;
