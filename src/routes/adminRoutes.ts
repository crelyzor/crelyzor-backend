import { Router } from "express";
import { verifyAdmin } from "../middleware/verifyAdmin";
import { authLimiter } from "../utils/rateLimit/rateLimiter";
import {
  login,
  me,
  logout,
  getTeam,
  deleteTeamMember,
  invite,
  checkInvite,
  acceptInviteHandler,
  getUsers,
  getUser,
  updatePlan,
  resetUsage,
  getStats,
  // Phase 6 P8
  getConfig,
  patchConfig,
  getTeamsAdmin,
  getTeamDetailAdmin,
  deleteTeamAdmin,
} from "../controllers/adminController";

const adminRouter = Router();

// ─── Public (no auth) ────────────────────────────────────────────────────────
adminRouter.post("/auth/login", authLimiter, login);
adminRouter.get("/auth/me", authLimiter, me);
adminRouter.post("/auth/logout", logout);
adminRouter.get("/auth/invite/:token", authLimiter, checkInvite);
adminRouter.post("/auth/accept-invite", authLimiter, acceptInviteHandler);

// ─── Protected (requires admin JWT) ──────────────────────────────────────────
adminRouter.use(verifyAdmin);

adminRouter.get("/stats", getStats);

adminRouter.get("/team", getTeam);
adminRouter.post("/team/invite", invite);
adminRouter.delete("/team/:id", deleteTeamMember);

adminRouter.get("/users", getUsers);
adminRouter.get("/users/:id", getUser);
adminRouter.patch("/users/:id/plan", updatePlan);
adminRouter.patch("/users/:id/usage/reset", resetUsage);

// ── Phase 6 P8 — SystemConfig + team admin overrides ──────────────────────
adminRouter.get("/config", getConfig);
adminRouter.patch("/config/:key", patchConfig);

adminRouter.get("/teams", getTeamsAdmin);
adminRouter.get("/teams/:teamId", getTeamDetailAdmin);
adminRouter.delete("/teams/:teamId", deleteTeamAdmin);

export default adminRouter;
