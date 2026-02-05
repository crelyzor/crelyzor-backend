import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import * as transcriptController from "../controllers/transcriptController";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Get transcript for a meeting
router.get(
  "/meetings/:meetingId/transcript",
  transcriptController.getTranscript
);

// Get transcription status
router.get(
  "/meetings/:meetingId/transcript/status",
  transcriptController.getTranscriptionStatus
);

export default router;
