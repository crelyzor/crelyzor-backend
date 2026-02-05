import { Router } from "express";
import { inviteTokenController } from "../controllers/inviteTokenController";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";

const router = Router();

/**
 * Organization Invitation System
 *
 * Flow:
 * 1. Admin/Owner sends invite by email → POST /send
 * 2. Recipient receives email with token link
 * 3. Recipient views invite details → POST /details (public)
 * 4. Recipient accepts invite → POST /accept (authenticated)
 */

// Send an invitation to join organization
router.post(
  "/send",
  verifyJWT,
  resolveOrgContext,
  requirePermission("CREATE_USER"),
  inviteTokenController.sendInvite,
);

// Get invite details (public endpoint - no auth required)
router.post("/details", inviteTokenController.getInviteDetails);

// Accept an invite and join organization (authenticated)
router.post(
  "/accept",
  verifyJWT,
  inviteTokenController.acceptInvite,
);

// List all pending invites for an organization
router.get(
  "/pending",
  verifyJWT,
  resolveOrgContext,
  requirePermission("READ_USER"),
  inviteTokenController.listPendingInvites,
);

// Cancel/revoke an invite
router.delete(
  "/:inviteId",
  verifyJWT,
  resolveOrgContext,
  requirePermission("DELETE_USER"),
  inviteTokenController.cancelInvite,
);

export default router;
