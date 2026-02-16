import { Router } from "express";
import { cardController } from "../controllers/cardController";

const publicCardRouter = Router();

// All routes here are public (no auth required)

/** GET /api/v1/public/card/:username — Get user's default card */
publicCardRouter.get("/card/:username", (req, res) =>
  cardController.getPublicCard(req, res),
);

/** GET /api/v1/public/card/:username/:slug — Get specific card by slug */
publicCardRouter.get("/card/:username/:slug", (req, res) =>
  cardController.getPublicCard(req, res),
);

/** GET /api/v1/public/card/:username/vcard — Download vCard for default card */
publicCardRouter.get("/card/:username/vcard", (req, res) =>
  cardController.getVCard(req, res),
);

/** GET /api/v1/public/card/:username/:slug/vcard — Download vCard for specific card */
publicCardRouter.get("/card/:username/:slug/vcard", (req, res) =>
  cardController.getVCard(req, res),
);

/** POST /api/v1/public/card/:cardId/contact — Submit contact info (scanner shares details) */
publicCardRouter.post("/card/:cardId/contact", (req, res) =>
  cardController.submitContact(req, res),
);

/** POST /api/v1/public/card/:cardId/click — Track a link click */
publicCardRouter.post("/card/:cardId/click", (req, res) =>
  cardController.trackLinkClick(req, res),
);

export default publicCardRouter;
