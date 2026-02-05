import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import * as aiController from "../controllers/aiController";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

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
