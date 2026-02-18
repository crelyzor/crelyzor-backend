import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { eventTypeController } from "../controllers/eventTypeController";

const eventTypeRouter = Router();

// All routes require authentication only (no org context)
eventTypeRouter.use(verifyJWT);

/** POST /api/v1/event-types — create event type */
eventTypeRouter.post("/", (req, res) =>
  eventTypeController.createEventType(req, res),
);

/** GET /api/v1/event-types — list event types */
eventTypeRouter.get("/", (req, res) =>
  eventTypeController.getEventTypes(req, res),
);

/** GET /api/v1/event-types/:eventTypeId — get event type */
eventTypeRouter.get("/:eventTypeId", (req, res) =>
  eventTypeController.getEventTypeById(req, res),
);

/** PUT /api/v1/event-types/:eventTypeId — update event type */
eventTypeRouter.put("/:eventTypeId", (req, res) =>
  eventTypeController.updateEventType(req, res),
);

/** DELETE /api/v1/event-types/:eventTypeId — delete event type */
eventTypeRouter.delete("/:eventTypeId", (req, res) =>
  eventTypeController.deleteEventType(req, res),
);

/** PATCH /api/v1/event-types/:eventTypeId/toggle — toggle active */
eventTypeRouter.patch("/:eventTypeId/toggle", (req, res) =>
  eventTypeController.toggleEventType(req, res),
);

export default eventTypeRouter;
