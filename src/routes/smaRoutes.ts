import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { singleFileUpload } from "../middleware/uploadMiddleware";
import * as recordingController from "../controllers/recordingController";
import * as transcriptController from "../controllers/transcriptController";
import * as aiController from "../controllers/aiController";
import * as speakerController from "../controllers/speakerController";
import * as taskController from "../controllers/taskController";
import * as shareController from "../controllers/shareController";
import * as exportController from "../controllers/exportController";

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
  recordingController.uploadRecording,
);

// Get recordings for a meeting
router.get(
  "/meetings/:meetingId/recordings",
  recordingController.getRecordings,
);

// Delete a recording
router.delete("/recordings/:recordingId", recordingController.deleteRecording);

// Trigger AI processing for a meeting
router.post(
  "/meetings/:meetingId/process-ai",
  recordingController.triggerAIProcessing,
);

// ========================================
// 📝 TRANSCRIPT ROUTES
// ========================================

// Get transcript for a meeting
router.get(
  "/meetings/:meetingId/transcript",
  transcriptController.getTranscript,
);

// Get transcription status
router.get(
  "/meetings/:meetingId/transcript/status",
  transcriptController.getTranscriptionStatus,
);

// Edit a transcript segment
router.patch(
  "/meetings/:meetingId/transcript/segments/:segmentId",
  transcriptController.patchSegment,
);

// Edit AI summary / key points / title
router.patch("/meetings/:meetingId/summary", transcriptController.patchSummary);

// ========================================
// 🎙️ SPEAKER ROUTES
// ========================================

// Get all speakers for a meeting
router.get("/meetings/:meetingId/speakers", speakerController.getSpeakers);

// Rename / update a speaker
router.patch(
  "/meetings/:meetingId/speakers/:speakerId",
  speakerController.renameSpeaker,
);

// ========================================
// 🤖 AI ROUTES
// ========================================

// AI Summary routes
router.get("/meetings/:meetingId/summary", aiController.getSummary);
router.post(
  "/meetings/:meetingId/summary/regenerate",
  aiController.regenerateSummary,
);
router.post(
  "/meetings/:meetingId/title/regenerate",
  aiController.regenerateTitle,
);

// Ask AI — streams response via SSE
router.post("/meetings/:meetingId/ask", aiController.askAI);

// AI Content Generation
router.get("/meetings/:meetingId/generated", aiController.getGeneratedContents);
router.post("/meetings/:meetingId/generate", aiController.generateContent);

// Tasks routes
router.get("/meetings/:meetingId/tasks", taskController.getTasks);
router.post("/meetings/:meetingId/tasks", taskController.createTask);
router.patch("/tasks/:taskId", taskController.updateTask);
router.delete("/tasks/:taskId", taskController.deleteTask);

// Notes routes
router.get("/meetings/:meetingId/notes", aiController.getNotes);
router.post("/meetings/:meetingId/notes", aiController.createNote);
router.delete("/notes/:noteId", aiController.deleteNote);

// ========================================
// 🔗 SHARE ROUTES
// ========================================

// Create or get share for a meeting (idempotent)
router.post("/meetings/:meetingId/share", shareController.createShare);

// Update share visibility + field flags
router.patch("/meetings/:meetingId/share", shareController.patchShare);

// ========================================
// 📄 EXPORT ROUTES
// ========================================

// Export transcript or summary as PDF or TXT
router.get(
  "/meetings/:meetingId/export",
  exportController.exportMeetingContent,
);

export default router;
