import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { syncController } from "../controllers/syncController";

const syncRouter = Router();

// All routes require authentication
syncRouter.use(verifyJWT);

syncRouter.post("/", (req, res) => syncController.syncGoogleCalendar(req, res));
syncRouter.get("/status", (req, res) => syncController.getSyncStatus(req, res));
syncRouter.get("/events", (req, res) =>
  syncController.getSyncedEvents(req, res),
);
syncRouter.post("/link-event", (req, res) =>
  syncController.linkEventToMeeting(req, res),
);

export default syncRouter;
