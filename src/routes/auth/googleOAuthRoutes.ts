import { Router } from "express";
import { googleController } from "../../controllers/googleController";

const router = Router();

// 🔹 GOOGLE OAUTH - SIGN-IN (no JWT needed)
router.get("/login", googleController.redirectToGoogleLogin);
router.get("/login/callback", googleController.handleGoogleLoginCallback);

export default router;
