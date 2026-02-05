import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";
import { userController } from "../controllers/userUpdateController";

const userRouter = Router();

userRouter.use(verifyJWT);

userRouter.patch(
  "/profile",
  resolveOrgContext,
  requirePermission("MANAGE_USER"),
  userController.updateProfile,
);
export default userRouter;
