import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { singleFileUpload } from "../middleware/uploadMiddleware";
import * as recordingController from "../controllers/recordingController";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Upload recording for a meeting
router.post(
  "/meetings/:meetingId/recordings",
  singleFileUpload,
  recordingController.uploadRecording
);

// Get recordings for a meeting
router.get(
  "/meetings/:meetingId/recordings",
  recordingController.getRecordings
);

// Delete a recording
router.delete(
  "/recordings/:recordingId",
  recordingController.deleteRecording
);

// Trigger AI processing for a meeting
router.post(
  "/meetings/:meetingId/process-ai",
  recordingController.triggerAIProcessing
);

export default router;
