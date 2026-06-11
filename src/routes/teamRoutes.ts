import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as teamController from "../controllers/teamController";
import * as teamMemberController from "../controllers/teamMemberController";
import * as teamInviteController from "../controllers/teamInviteController";
import * as teamUsageController from "../controllers/teamUsageController";
import * as teamCardController from "../controllers/teamCardController";

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
// Join-by-link is a one-shot action; tight limit to prevent brute-forcing tokens.
const inviteLinkJoinLimiter = userRateLimit(
  10,
  60 * 60 * 1000,
  "teams:invite-link-join",
);
// Generate/revoke is an admin action — very infrequent.
const inviteLinkMutateLimiter = userRateLimit(
  20,
  60 * 60 * 1000,
  "teams:invite-link-mutate",
);

// ── Team CRUD ────────────────────────────────────────────────────────────────
router.get("/", readLimiter, teamController.listMine);
// Must be registered before /:teamId/* to prevent Express from matching
// "check-slug" as a teamId.
router.get("/check-slug", readLimiter, teamController.checkSlug);
router.post("/", createLimiter, teamController.create);
// Phase 6 P13 — invitee-side pending invites. Must be registered BEFORE the
// `/:teamId/*` family below, otherwise Express matches `me` as a `:teamId`.
router.get("/me/invites", readLimiter, teamInviteController.listMine);
// Phase 6 P16 — join-by-link. Must be registered BEFORE the /:teamId/* family
// below, otherwise Express matches "join-by-link" as a :teamId param.
router.post(
  "/join-by-link/:token",
  inviteLinkJoinLimiter,
  teamInviteController.joinByLink,
);
router.get("/:teamId", readLimiter, teamController.getOne);
router.patch("/:teamId", readLimiter, teamController.update);
router.delete("/:teamId", readLimiter, teamController.remove);
router.post(
  "/:teamId/transfer-ownership",
  transferLimiter,
  teamController.transferOwnership,
);

// ── Usage breakdown (Phase 6 P5.8) ───────────────────────────────────────────
// ADMIN+ only; controller enforces the role check.
router.get("/:teamId/usage", readLimiter, teamUsageController.getUsage);

// ── Cards (Phase 6 P17) ───────────────────────────────────────────────────────
router.get("/:teamId/cards", readLimiter, teamCardController.getCards);

// ── Members (Phase 6 P2.a) ───────────────────────────────────────────────────
router.get("/:teamId/members", readLimiter, teamMemberController.list);
router.patch(
  "/:teamId/members/:userId",
  memberMutateLimiter,
  teamMemberController.updateRole,
);
router.patch(
  "/:teamId/members/:userId/designation",
  memberMutateLimiter,
  teamMemberController.updateDesignation,
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
// ── Invite link (Phase 6 P16) ────────────────────────────────────────────────
router.get(
  "/:teamId/invite-link",
  readLimiter,
  teamInviteController.getInviteLink,
);
router.post(
  "/:teamId/invite-link/generate",
  inviteLinkMutateLimiter,
  teamInviteController.generateInviteLink,
);
router.delete(
  "/:teamId/invite-link",
  inviteLinkMutateLimiter,
  teamInviteController.revokeInviteLink,
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
