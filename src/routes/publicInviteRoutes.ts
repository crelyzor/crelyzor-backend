import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as publicInviteController from "../controllers/publicInviteController";

const router = Router();

// Public lookup — 60 hits/min/IP. Token is 256-bit random hex so guessing is
// infeasible; this limit is for hot-loop/scraper defense, not brute force.
const publicLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

// Token-based accept/decline — JWT-bound + 10/hr/user.
const tokenRespondLimiter = userRateLimit(
  10,
  60 * 60 * 1000,
  "invites:token-respond",
);

router.get("/:token", publicLookupLimiter, publicInviteController.getByToken);
router.post(
  "/:token/accept",
  verifyJWT,
  tokenRespondLimiter,
  publicInviteController.acceptByToken,
);
router.post(
  "/:token/decline",
  verifyJWT,
  tokenRespondLimiter,
  publicInviteController.declineByToken,
);

export default router;
