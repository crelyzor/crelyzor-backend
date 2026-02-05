import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";
import { availabilityController } from "../controllers/availabilityController";

const availabilityRouter = Router();

// All routes require authentication
availabilityRouter.use(verifyJWT);
availabilityRouter.use(resolveOrgContext);

/**
 * Recurring Availability Routes
 */

/**
 * POST /api/v1/availability/recurring
 * Create recurring availability pattern (e.g., Mon-Fri 4-7 PM)
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.post(
  "/recurring",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.createRecurringAvailability(req, res),
);

/**
 * POST /api/v1/availability/recurring/batch
 * Create multiple recurring availability patterns in one request
 * Accepts array of slots with different days and times
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.post(
  "/recurring/batch",
  requirePermission("MANAGE_MEETING"),
  (req, res) =>
    availabilityController.createBatchRecurringAvailability(req, res),
);

/**
 * GET /api/v1/availability/recurring
 * Get recurring availability patterns for an org member
 * Requires: MANAGE_MEETING permission
 * Query params: orgMemberId (optional, defaults to current user)
 */
availabilityRouter.get(
  "/recurring",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.getRecurringAvailability(req, res),
);

/**
 * PUT /api/v1/availability/recurring/:availabilityId
 * Update recurring availability pattern
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.put(
  "/recurring/:availabilityId",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.updateRecurringAvailability(req, res),
);

/**
 * DELETE /api/v1/availability/recurring/:availabilityId
 * Delete recurring availability pattern
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.delete(
  "/recurring/:availabilityId",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.deleteRecurringAvailability(req, res),
);

/**
 * Custom Slot Routes
 */

/**
 * POST /api/v1/availability/custom
 * Create custom slot for specific date (overrides recurring availability)
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.post(
  "/custom",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.createCustomSlot(req, res),
);

/**
 * GET /api/v1/availability/custom
 * Get custom slots for date range
 * Requires: MANAGE_MEETING permission
 * Query params: startDate, endDate, orgMemberId (optional)
 */
availabilityRouter.get(
  "/custom",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.getCustomSlots(req, res),
);

/**
 * DELETE /api/v1/availability/custom/:slotId
 * Delete custom slot
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.delete(
  "/custom/:slotId",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.deleteCustomSlot(req, res),
);

/**
 * Blocked Time Routes
 */

/**
 * POST /api/v1/availability/blocked
 * Create blocked time (unavailability, exceptions, holidays)
 * Supports recurring (WEEKLY, MONTHLY)
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.post(
  "/blocked",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.createBlockedTime(req, res),
);

/**
 * GET /api/v1/availability/blocked
 * Get blocked times for date range
 * Requires: MANAGE_MEETING permission
 * Query params: startDate, endDate, orgMemberId (optional)
 */
availabilityRouter.get(
  "/blocked",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.getBlockedTimes(req, res),
);

/**
 * DELETE /api/v1/availability/blocked/:blockedTimeId
 * Delete blocked time
 * Requires: MANAGE_MEETING permission
 */
availabilityRouter.delete(
  "/blocked/:blockedTimeId",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.deleteBlockedTime(req, res),
);

/**
 * Available Slots Route
 */

/**
 * GET /api/v1/availability/slots/:orgMemberId
 * Get available slots for an org member
 * Complex algorithm combining:
 * - Recurring availability patterns
 * - Custom slots (override recurring)
 * - Excluded blocked times (including recurring)
 * - Excluded existing meetings
 * Requires: MANAGE_MEETING permission
 * Query params: startDate, endDate, slotDuration (optional, default 30 minutes)
 */
availabilityRouter.get(
  "/slots/:orgMemberId",
  requirePermission("MANAGE_MEETING"),
  (req, res) => availabilityController.getAvailableSlots(req, res),
);

export default availabilityRouter;
