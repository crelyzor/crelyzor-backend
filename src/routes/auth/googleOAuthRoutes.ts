import { Router } from "express";
import { googleController } from "../../controllers/googleController";
import { verifyJWT } from "../../middleware/authMiddleware";

const router = Router();

// 🔹 GOOGLE OAUTH - SIGN-IN (no JWT needed)
router.get("/login", googleController.redirectToGoogleLogin);
router.get("/login/callback", googleController.handleGoogleLoginCallback);

// 🔹 GOOGLE CALENDAR CONNECT (requires active session)
// POST returns the Google OAuth URL as JSON — frontend navigates to it.
// This keeps the JWT in the Authorization header (not exposed in a redirect URL).
// Note: /calendar/connect/callback must be added as an authorized redirect URI
//       in Google Cloud Console: <BASE_URL>/auth/google/calendar/connect/callback
router.post(
  "/calendar/connect",
  verifyJWT,
  googleController.getCalendarConnectUrl,
);
router.get(
  "/calendar/connect/callback",
  googleController.handleCalendarConnectCallback,
);

export default router;
