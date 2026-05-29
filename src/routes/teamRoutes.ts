import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as teamController from "../controllers/teamController";
import * as teamMemberController from "../controllers/teamMemberController";
import * as teamInviteController from "../controllers/teamInviteController";

const router = Router();

router.use(verifyJWT);

// Reads + non-destructive mutations
const readLimiter = userRateLimit(120, 60 * 60 * 1000, "teams:read");
// Team creation is a heavy operation (KMS wrap + multi-row tx + advisory lock).
const createLimiter = userRateLimit(10, 60 * 60 * 1000, "teams:create");
// Ownership transfer is rare and high-impact — tightest limit.
const transferLimiter = userRateLimit(5, 60 * 60 * 1000, "teams:transfer");
// Member-state mutations (role change, removal).
const memberMutateLimiter = userRateLimit(
  30,
  60 * 60 * 1000,
  "teams:member-mutate",
);
// Self-leave is one-shot per team and rare; tightest mutation limit.
const leaveLimiter = userRateLimit(5, 60 * 60 * 1000, "teams:leave");
// Invite creation — admins burst small batches, but Resend has a fan-out cost.
const inviteCreateLimiter = userRateLimit(
  10,
  60 * 60 * 1000,
  "teams:invite-create",
);
// Resending is the spammiest action — tighter cap.
const inviteResendLimiter = userRateLimit(
  5,
  60 * 60 * 1000,
  "teams:invite-resend",
);
// Accept/decline of an in-app invite.
const inviteRespondLimiter = userRateLimit(
  10,
  60 * 60 * 1000,
  "teams:invite-respond",
);

// ── Team CRUD ────────────────────────────────────────────────────────────────
router.get("/", readLimiter, teamController.listMine);
router.post("/", createLimiter, teamController.create);
router.patch("/:teamId", readLimiter, teamController.update);
router.delete("/:teamId", readLimiter, teamController.remove);
router.post(
  "/:teamId/transfer-ownership",
  transferLimiter,
  teamController.transferOwnership,
);

// ── Members (Phase 6 P2.a) ───────────────────────────────────────────────────
router.get("/:teamId/members", readLimiter, teamMemberController.list);
router.patch(
  "/:teamId/members/:userId",
  memberMutateLimiter,
  teamMemberController.updateRole,
);
router.delete(
  "/:teamId/members/:userId",
  memberMutateLimiter,
  teamMemberController.remove,
);
router.delete("/:teamId/leave", leaveLimiter, teamMemberController.leave);

// ── Invites (Phase 6 P2.b) ───────────────────────────────────────────────────
router.post(
  "/:teamId/members/invite",
  inviteCreateLimiter,
  teamInviteController.create,
);
router.get("/:teamId/invites", readLimiter, teamInviteController.list);
router.post(
  "/:teamId/invites/:inviteId/resend",
  inviteResendLimiter,
  teamInviteController.resend,
);
router.delete(
  "/:teamId/invites/:inviteId",
  memberMutateLimiter,
  teamInviteController.cancel,
);
router.post(
  "/:teamId/invites/accept",
  inviteRespondLimiter,
  teamInviteController.acceptByTeam,
);
router.post(
  "/:teamId/invites/decline",
  inviteRespondLimiter,
  teamInviteController.declineByTeam,
);

export default router;
