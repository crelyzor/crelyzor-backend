import { Router } from "express";
import { authController } from "../controllers/authController";
import {
  verifyJWT,
  validateRefreshToken,
  userRateLimit,
  autoRefreshToken,
} from "../middleware/authMiddleware";

const authRouter = Router();

// Token refresh (still needed for Google OAuth sessions)
authRouter.post(
  "/refresh-token",
  validateRefreshToken,
  authController.refreshToken,
);

// Protected routes (require JWT)
authRouter.use(verifyJWT);
authRouter.use(autoRefreshToken);
authRouter.use(userRateLimit(1000, 60 * 60 * 1000)); // 1000 requests per hour per user

authRouter.post("/logout", authController.logout);
authRouter.get("/profile", authController.getProfile);
authRouter.get("/sessions", authController.getSessions);
authRouter.delete("/sessions/:sessionId", authController.revokeSession);

export default authRouter;
