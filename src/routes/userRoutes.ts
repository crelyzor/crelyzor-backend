import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requireRole } from "../middleware/roleMiddleware";
import { UserRoleEnum } from "@prisma/client";
import { userController } from "../controllers/userUpdateController";

const userRouter = Router();

userRouter.use(verifyJWT);

userRouter.patch(
  "/profile",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  userController.updateProfile,
);

export default userRouter;
