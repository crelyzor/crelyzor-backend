import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { meetingController } from "../controllers/meetingController";
import * as tagController from "../controllers/tagController";

const router = Router();

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

/** PATCH /api/v1/meetings/:meetingId/cancel */
router.patch("/:meetingId/cancel", (req, res) =>
  meetingController.cancelMeeting(req, res),
);

/** PATCH /api/v1/meetings/:meetingId/complete */
router.patch("/:meetingId/complete", (req, res) =>
  meetingController.completeMeeting(req, res),
);

/** GET /api/v1/meetings — get meetings with filters */
router.get("/", (req, res) => meetingController.getMeetings(req, res));

/** GET /api/v1/meetings/:meetingId — get single meeting */
router.get("/:meetingId", (req, res) =>
  meetingController.getMeetingById(req, res),
);

/** DELETE /api/v1/meetings/:meetingId — soft delete */
router.delete("/:meetingId", (req, res) =>
  meetingController.deleteMeeting(req, res),
);

// ────────────────────────────────────────────────────────────
// TAG SUB-ROUTES
// ────────────────────────────────────────────────────────────

/** GET /api/v1/meetings/:meetingId/tags */
router.get("/:meetingId/tags", tagController.getMeetingTags);

/** POST /api/v1/meetings/:meetingId/tags/:tagId */
router.post("/:meetingId/tags/:tagId", tagController.attachTagToMeeting);

/** DELETE /api/v1/meetings/:meetingId/tags/:tagId */
router.delete("/:meetingId/tags/:tagId", tagController.detachTagFromMeeting);

export default router;
