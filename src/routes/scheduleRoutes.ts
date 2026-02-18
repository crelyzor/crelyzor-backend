import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { scheduleController } from "../controllers/scheduleController";

const scheduleRouter = Router();

// All routes require authentication only (no org context)
scheduleRouter.use(verifyJWT);

/** POST /api/v1/schedules — create schedule */
scheduleRouter.post("/", (req, res) =>
  scheduleController.createSchedule(req, res),
);

/** GET /api/v1/schedules — list schedules */
scheduleRouter.get("/", (req, res) =>
  scheduleController.getSchedules(req, res),
);

/** GET /api/v1/schedules/default — get or auto-create default schedule */
scheduleRouter.get("/default", (req, res) =>
  scheduleController.getDefaultSchedule(req, res),
);

/** PUT /api/v1/schedules/:scheduleId — update schedule */
scheduleRouter.put("/:scheduleId", (req, res) =>
  scheduleController.updateSchedule(req, res),
);

/** DELETE /api/v1/schedules/:scheduleId — delete schedule */
scheduleRouter.delete("/:scheduleId", (req, res) =>
  scheduleController.deleteSchedule(req, res),
);

/** PATCH /api/v1/schedules/:scheduleId/default — set as default */
scheduleRouter.patch("/:scheduleId/default", (req, res) =>
  scheduleController.setDefaultSchedule(req, res),
);

export default scheduleRouter;
