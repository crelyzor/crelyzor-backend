import { Router } from "express";
import { verifyAdmin } from "../middleware/verifyAdmin";
import {
  login,
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
} from "../controllers/adminController";

const adminRouter = Router();

// ─── Public (no auth) ────────────────────────────────────────────────────────
adminRouter.post("/auth/login", login);
adminRouter.get("/auth/invite/:token", checkInvite);
adminRouter.post("/auth/accept-invite", acceptInviteHandler);

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

export default adminRouter;
