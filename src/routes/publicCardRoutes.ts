import { Router } from "express";
import { cardController } from "../controllers/cardController";
import rateLimit from "express-rate-limit";

const publicCardRouter = Router();

const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

const clickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

// All routes here are public (no auth required)
// Note: vcard routes must be defined before /card/:username/:slug so that
// /card/testt/vcard is not matched as username=testt, slug=vcard.

/** GET /api/v1/public/card/:username/vcard — Download vCard for default card */
publicCardRouter.get("/card/:username/vcard", publicReadLimiter, (req, res) =>
  cardController.getVCard(req, res),
);

/** GET /api/v1/public/card/:username/:slug/vcard — Download vCard for specific card */
publicCardRouter.get(
  "/card/:username/:slug/vcard",
  publicReadLimiter,
  (req, res) => cardController.getVCard(req, res),
);

/** GET /api/v1/public/card/:username — Get user's default card */
publicCardRouter.get("/card/:username", publicReadLimiter, (req, res) =>
  cardController.getPublicCard(req, res),
);

/** GET /api/v1/public/card/:username/:slug — Get specific card by slug */
publicCardRouter.get("/card/:username/:slug", publicReadLimiter, (req, res) =>
  cardController.getPublicCard(req, res),
);

/** POST /api/v1/public/card/:cardId/contact — Submit contact info (scanner shares details) */
publicCardRouter.post("/card/:cardId/contact", publicWriteLimiter, (req, res) =>
  cardController.submitContact(req, res),
);

/** POST /api/v1/public/card/:cardId/click — Track a link click */
publicCardRouter.post("/card/:cardId/click", clickLimiter, (req, res) =>
  cardController.trackLinkClick(req, res),
);

export default publicCardRouter;
