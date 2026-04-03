import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as eventTypeController from "../controllers/eventTypeController";
import * as scheduleController from "../controllers/scheduleController";
import * as bookingManagementController from "../controllers/bookingManagementController";

const schedulingRouter = Router();

schedulingRouter.use(verifyJWT);

// Shared write rate limit: 60 requests/hour for availability mutations
const availabilityWriteLimit = userRateLimit(
  60,
  60 * 60 * 1000,
  "scheduling:availability:write",
);

// ── Event Types ──────────────────────────────────────────────────────────────
schedulingRouter.get("/event-types", eventTypeController.listEventTypes);
schedulingRouter.post("/event-types", eventTypeController.createEventType);
schedulingRouter.patch("/event-types/:id", eventTypeController.updateEventType);
schedulingRouter.delete("/event-types/:id", eventTypeController.deleteEventType);

// ── Availability Schedules ────────────────────────────────────────────────────
schedulingRouter.get("/schedules", scheduleController.listSchedules);
schedulingRouter.post("/schedules", scheduleController.createSchedule);
schedulingRouter.patch("/schedules/:id", scheduleController.updateSchedule);
schedulingRouter.delete("/schedules/:id", scheduleController.deleteSchedule);
schedulingRouter.post("/schedules/:id/copy", scheduleController.copySchedule);
schedulingRouter.post(
  "/schedules/:id/set-default",
  scheduleController.setDefaultSchedule,
);

// ── Schedule Slots ────────────────────────────────────────────────────────────
schedulingRouter.get("/schedules/:id/availability", scheduleController.getSlots);
schedulingRouter.patch(
  "/schedules/:id/availability",
  availabilityWriteLimit,
  scheduleController.patchSlots,
);

// ── Schedule Overrides ────────────────────────────────────────────────────────
schedulingRouter.get(
  "/schedules/:id/overrides",
  scheduleController.getOverrides,
);
schedulingRouter.post(
  "/schedules/:id/overrides",
  availabilityWriteLimit,
  scheduleController.createOverride,
);
schedulingRouter.delete(
  "/schedules/:id/overrides/:overrideId",
  availabilityWriteLimit,
  scheduleController.deleteOverride,
);

// ── Booking management (host) ─────────────────────────────────────────────────
schedulingRouter.get("/bookings", bookingManagementController.listBookings);
schedulingRouter.post(
  "/bookings/:id/confirm",
  bookingManagementController.confirmBooking,
);
schedulingRouter.post(
  "/bookings/:id/decline",
  bookingManagementController.declineBooking,
);
schedulingRouter.patch(
  "/bookings/:id/cancel",
  bookingManagementController.cancelBooking,
);

export default schedulingRouter;
