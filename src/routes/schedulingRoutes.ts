import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as eventTypeController from "../controllers/eventTypeController";
import * as availabilityController from "../controllers/availabilityController";
import * as bookingManagementController from "../controllers/bookingManagementController";

const schedulingRouter = Router();

schedulingRouter.use(verifyJWT);

// Shared write rate limit: 60 requests/hour for availability mutations
const availabilityWriteLimit = userRateLimit(60, 60 * 60 * 1000, "scheduling:availability:write");

// ── Event Types ──────────────────────────────────────────────────────────────
schedulingRouter.get("/event-types", eventTypeController.listEventTypes);
schedulingRouter.post("/event-types", eventTypeController.createEventType);
schedulingRouter.patch("/event-types/:id", eventTypeController.updateEventType);
schedulingRouter.delete("/event-types/:id", eventTypeController.deleteEventType);

// ── Availability (weekly schedule) ───────────────────────────────────────────
schedulingRouter.get("/availability", availabilityController.getAvailability);
schedulingRouter.patch("/availability", availabilityWriteLimit, availabilityController.patchAvailability);

// ── Availability overrides (specific blocked dates) ──────────────────────────
schedulingRouter.get("/availability/overrides", availabilityController.getOverrides);
schedulingRouter.post("/availability/overrides", availabilityWriteLimit, availabilityController.createOverride);
schedulingRouter.delete("/availability/overrides/:id", availabilityWriteLimit, availabilityController.deleteOverride);

// ── Booking management (host) ─────────────────────────────────────────────────
schedulingRouter.get("/bookings", bookingManagementController.listBookings);
schedulingRouter.patch("/bookings/:id/cancel", bookingManagementController.cancelBooking);

export default schedulingRouter;
