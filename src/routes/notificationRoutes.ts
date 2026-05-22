import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as notificationController from "../controllers/notificationController";

const router = Router();

router.use(verifyJWT);
router.use(userRateLimit(300, 60 * 60 * 1000, "notifications"));

router.get("/", notificationController.list);
router.get("/unread-count", notificationController.unreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markOneRead);
router.delete("/:id", notificationController.remove);

export default router;
