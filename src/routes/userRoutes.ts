import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import { userController } from "../controllers/userUpdateController";

const userRouter = Router();

userRouter.use(verifyJWT);

userRouter.get("/search", userRateLimit(60, 60 * 60 * 1000, "users:search"), userController.searchUsers);
userRouter.patch("/profile", userController.updateProfile);

export default userRouter;
