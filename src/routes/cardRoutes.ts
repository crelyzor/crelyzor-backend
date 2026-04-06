import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { cardController } from "../controllers/cardController";
import * as tagController from "../controllers/tagController";

const cardRouter = Router();

// All card management routes require authentication
cardRouter.use(verifyJWT);

// ========================================
// CARD CRUD
// ========================================

/** GET /api/v1/cards/templates — Get available card templates */
cardRouter.get("/templates", (req, res) =>
  cardController.getTemplates(req, res),
);

/** POST /api/v1/cards/preview — Generate preview HTML without saving */
cardRouter.post("/preview", (req, res) => cardController.previewCard(req, res));

/** POST /api/v1/cards — Create a new card */
cardRouter.post("/", (req, res) => cardController.createCard(req, res));

/** GET /api/v1/cards — Get all user's cards */
cardRouter.get("/", (req, res) => cardController.getUserCards(req, res));

/** GET /api/v1/cards/:cardId — Get a single card */
cardRouter.get("/:cardId", (req, res) => cardController.getCardById(req, res));

/** PATCH /api/v1/cards/:cardId — Update a card */
cardRouter.patch("/:cardId", (req, res) => cardController.updateCard(req, res));

/** DELETE /api/v1/cards/:cardId — Delete a card */
cardRouter.delete("/:cardId", (req, res) =>
  cardController.deleteCard(req, res),
);

/** POST /api/v1/cards/:cardId/duplicate — Duplicate a card */
cardRouter.post("/:cardId/duplicate", (req, res) =>
  cardController.duplicateCard(req, res),
);

// ========================================
// LINKED ENTITIES
// ========================================

/** GET /api/v1/cards/:cardId/meetings — Get meetings linked to this card */
cardRouter.get("/:cardId/meetings", (req, res) =>
  cardController.getCardMeetings(req, res),
);

// ========================================
// ANALYTICS
// ========================================

/** GET /api/v1/cards/:cardId/analytics — Get card analytics */
cardRouter.get("/:cardId/analytics", (req, res) =>
  cardController.getCardAnalytics(req, res),
);

// ========================================
// CONTACTS MANAGEMENT
// ========================================

/** GET /api/v1/cards/contacts/all — Get all contacts across cards */
cardRouter.get("/contacts/all", (req, res) =>
  cardController.getContacts(req, res),
);

/** GET /api/v1/cards/contacts/export — Export contacts as CSV */
cardRouter.get("/contacts/export", (req, res) =>
  cardController.exportContacts(req, res),
);

/** PATCH /api/v1/cards/contacts/:contactId/tags — Update contact tags */
cardRouter.patch("/contacts/:contactId/tags", (req, res) =>
  cardController.updateContactTags(req, res),
);

/** DELETE /api/v1/cards/contacts/:contactId — Delete a contact */
cardRouter.delete("/contacts/:contactId", (req, res) =>
  cardController.deleteContact(req, res),
);

// ────────────────────────────────────────────────────────────
// TAG SUB-ROUTES
// ────────────────────────────────────────────────────────────

/** GET /api/v1/cards/:cardId/tags */
cardRouter.get("/:cardId/tags", tagController.getCardTags);

/** POST /api/v1/cards/:cardId/tags/:tagId */
cardRouter.post("/:cardId/tags/:tagId", tagController.attachTagToCard);

/** DELETE /api/v1/cards/:cardId/tags/:tagId */
cardRouter.delete("/:cardId/tags/:tagId", tagController.detachTagFromCard);

// ────────────────────────────────────────────────────────────
// CONTACT TAG SUB-ROUTES
// ────────────────────────────────────────────────────────────

/** GET /api/v1/cards/:cardId/contacts/:contactId/tags */
cardRouter.get("/:cardId/contacts/:contactId/tags", tagController.getContactTags);

/** POST /api/v1/cards/:cardId/contacts/:contactId/tags/:tagId */
cardRouter.post("/:cardId/contacts/:contactId/tags/:tagId", tagController.attachTagToContact);

/** DELETE /api/v1/cards/:cardId/contacts/:contactId/tags/:tagId */
cardRouter.delete("/:cardId/contacts/:contactId/tags/:tagId", tagController.detachTagFromContact);

export default cardRouter;
