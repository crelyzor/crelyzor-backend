import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { availabilityController } from "../controllers/availabilityController";

const availabilityRouter = Router();

// All routes require authentication only (no org context)
availabilityRouter.use(verifyJWT);

// ========================================
// Recurring Availability (schedule-scoped)
// ========================================

/** POST /api/v1/availability/:scheduleId/recurring */
availabilityRouter.post("/:scheduleId/recurring", (req, res) =>
  availabilityController.createRecurringAvailability(req, res),
);

/** POST /api/v1/availability/:scheduleId/recurring/batch */
availabilityRouter.post("/:scheduleId/recurring/batch", (req, res) =>
  availabilityController.createBatchRecurringAvailability(req, res),
);

/** GET /api/v1/availability/:scheduleId/recurring */
availabilityRouter.get("/:scheduleId/recurring", (req, res) =>
  availabilityController.getRecurringAvailability(req, res),
);

/** PUT /api/v1/availability/:scheduleId/recurring/:availabilityId */
availabilityRouter.put("/:scheduleId/recurring/:availabilityId", (req, res) =>
  availabilityController.updateRecurringAvailability(req, res),
);

/** DELETE /api/v1/availability/:scheduleId/recurring/:availabilityId */
availabilityRouter.delete(
  "/:scheduleId/recurring/:availabilityId",
  (req, res) => availabilityController.deleteRecurringAvailability(req, res),
);

// ========================================
// Overrides / Custom Slots (schedule-scoped)
// ========================================

/** POST /api/v1/availability/:scheduleId/overrides */
availabilityRouter.post("/:scheduleId/overrides", (req, res) =>
  availabilityController.createOverride(req, res),
);

/** GET /api/v1/availability/:scheduleId/overrides */
availabilityRouter.get("/:scheduleId/overrides", (req, res) =>
  availabilityController.getOverrides(req, res),
);

/** DELETE /api/v1/availability/:scheduleId/overrides/:slotId */
availabilityRouter.delete("/:scheduleId/overrides/:slotId", (req, res) =>
  availabilityController.deleteOverride(req, res),
);

// ========================================
// Blocked Times (schedule-scoped)
// ========================================

/** POST /api/v1/availability/:scheduleId/blocked */
availabilityRouter.post("/:scheduleId/blocked", (req, res) =>
  availabilityController.createBlockedTime(req, res),
);

/** GET /api/v1/availability/:scheduleId/blocked */
availabilityRouter.get("/:scheduleId/blocked", (req, res) =>
  availabilityController.getBlockedTimes(req, res),
);

/** DELETE /api/v1/availability/:scheduleId/blocked/:blockedTimeId */
availabilityRouter.delete("/:scheduleId/blocked/:blockedTimeId", (req, res) =>
  availabilityController.deleteBlockedTime(req, res),
);

// ========================================
// Available Slots (schedule-scoped)
// ========================================

/** GET /api/v1/availability/:scheduleId/slots */
availabilityRouter.get("/:scheduleId/slots", (req, res) =>
  availabilityController.getAvailableSlots(req, res),
);

export default availabilityRouter;
