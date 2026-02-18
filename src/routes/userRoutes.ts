import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { userController } from "../controllers/userUpdateController";

const userRouter = Router();

userRouter.use(verifyJWT);

userRouter.patch("/profile", userController.updateProfile);

export default userRouter;
