import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { singleFileUpload } from "../middleware/uploadMiddleware";
import * as recordingController from "../controllers/recordingController";
import * as transcriptController from "../controllers/transcriptController";
import * as aiController from "../controllers/aiController";

const router = Router();

// All SMA routes require authentication
router.use(verifyJWT);

// ========================================
// 📹 RECORDING ROUTES
// ========================================

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

// ========================================
// 📝 TRANSCRIPT ROUTES
// ========================================

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

// ========================================
// 🤖 AI ROUTES
// ========================================

// AI Summary routes
router.get("/meetings/:meetingId/summary", aiController.getSummary);
router.post("/meetings/:meetingId/summary/regenerate", aiController.regenerateSummary);

// Action Items routes
router.get("/meetings/:meetingId/action-items", aiController.getActionItems);
router.post("/meetings/:meetingId/action-items", aiController.createActionItem);
router.patch("/action-items/:actionItemId", aiController.updateActionItem);

// Notes routes
router.get("/meetings/:meetingId/notes", aiController.getNotes);
router.post("/meetings/:meetingId/notes", aiController.createNote);
router.delete("/notes/:noteId", aiController.deleteNote);

export default router;
