import { Router } from "express";
import { verifyAdmin } from "../middleware/verifyAdmin";
import {
  login,
  getUsers,
  getUser,
  updatePlan,
  resetUsage,
  getStats,
} from "../controllers/adminController";

const adminRouter = Router();

// Public — no verifyAdmin (this is how you get the token)
adminRouter.post("/auth/login", login);

// All routes below require a valid admin JWT
adminRouter.use(verifyAdmin);

adminRouter.get("/stats", getStats);
adminRouter.get("/users", getUsers);
adminRouter.get("/users/:id", getUser);
adminRouter.patch("/users/:id/plan", updatePlan);
adminRouter.patch("/users/:id/usage/reset", resetUsage);

export default adminRouter;
