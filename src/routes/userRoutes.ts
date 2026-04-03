import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { userController } from "../controllers/userUpdateController";

const userRouter = Router();

userRouter.use(verifyJWT);

userRouter.get("/search", userController.searchUsers);
userRouter.patch("/profile", userController.updateProfile);

export default userRouter;
