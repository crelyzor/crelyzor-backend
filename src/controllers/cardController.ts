import { Request, Response } from "express";
import { cardService } from "../services/cardService";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import {
  createCardSchema,
  updateCardSchema,
  submitContactSchema,
  trackViewSchema,
} from "../validators/cardSchema";
import crypto from "crypto";

function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export const cardController = {
  // ========================================
  // AUTHENTICATED ROUTES (card management)
  // ========================================

  createCard: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const parsed = createCardSchema.safeParse(req.body);
      if (!parsed.success) throw ErrorFactory.validation(parsed.error);

      const card = await cardService.createCard(userId, parsed.data);

      apiResponse(res, {
        statusCode: 201,
        message: "Card created successfully",
        data: card,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  getUserCards: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const cards = await cardService.getUserCards(userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Cards retrieved successfully",
        data: cards,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  getCardById: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const card = await cardService.getCardById(
        userId,
        req.params.cardId as string,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Card retrieved successfully",
        data: card,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  updateCard: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const parsed = updateCardSchema.safeParse(req.body);
      if (!parsed.success) throw ErrorFactory.validation(parsed.error);

      const card = await cardService.updateCard(
        userId,
        req.params.cardId as string,
        parsed.data,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Card updated successfully",
        data: card,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  deleteCard: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      await cardService.deleteCard(userId, req.params.cardId as string);

      apiResponse(res, {
        statusCode: 200,
        message: "Card deleted successfully",
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  duplicateCard: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const { slug } = req.body;
      if (!slug) throw ErrorFactory.validation("New slug is required");

      const card = await cardService.duplicateCard(
        userId,
        req.params.cardId as string,
        slug,
      );

      apiResponse(res, {
        statusCode: 201,
        message: "Card duplicated successfully",
        data: card,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  // ========================================
  // CONTACTS MANAGEMENT (authenticated)
  // ========================================

  getContacts: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const { cardId, search, tags, page, limit } = req.query;

      const result = await cardService.getContacts(userId, {
        cardId: cardId as string,
        search: search as string,
        tags: tags ? (tags as string).split(",") : undefined,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Contacts retrieved successfully",
        data: result,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  updateContactTags: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const { tags } = req.body;
      if (!Array.isArray(tags))
        throw ErrorFactory.validation("Tags must be an array");

      const contact = await cardService.updateContactTags(
        userId,
        req.params.contactId as string,
        tags,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Contact tags updated successfully",
        data: contact,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  deleteContact: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      await cardService.deleteContact(userId, req.params.contactId as string);

      apiResponse(res, {
        statusCode: 200,
        message: "Contact deleted successfully",
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  exportContacts: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const { cardId } = req.query;
      const csv = await cardService.exportContacts(userId, cardId as string);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
      res.send(csv);
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  // ========================================
  // ANALYTICS (authenticated)
  // ========================================

  getCardAnalytics: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized();

      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const analytics = await cardService.getCardAnalytics(
        userId,
        req.params.cardId as string,
        days,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Analytics retrieved successfully",
        data: analytics,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  // ========================================
  // PUBLIC ROUTES (no auth needed)
  // ========================================

  getPublicCard: async (req: Request, res: Response): Promise<void> => {
    try {
      const username = req.params.username as string;
      const slug = req.params.slug as string | undefined;
      const result = await cardService.getPublicCard(username, slug);

      // Track the view
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "";
      await cardService.trackView(result.card.id, {
        ipHash: ip ? hashIP(ip) : undefined,
        userAgent: req.headers["user-agent"],
        referrer: req.headers.referer,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Card retrieved successfully",
        data: result,
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  submitContact: async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = submitContactSchema.safeParse(req.body);
      if (!parsed.success) throw ErrorFactory.validation(parsed.error);

      const contact = await cardService.submitContact(
        req.params.cardId as string,
        parsed.data,
      );

      apiResponse(res, {
        statusCode: 201,
        message: "Contact info submitted successfully",
        data: { id: contact.id },
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  trackLinkClick: async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = trackViewSchema.safeParse(req.body);
      if (!parsed.success) throw ErrorFactory.validation(parsed.error);

      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "";
      await cardService.trackView(req.params.cardId as string, {
        ipHash: ip ? hashIP(ip) : undefined,
        userAgent: req.headers["user-agent"],
        referrer: req.headers.referer,
        clickedLink: parsed.data.clickedLink,
      });

      apiResponse(res, { statusCode: 200, message: "Click tracked" });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  getVCard: async (req: Request, res: Response): Promise<void> => {
    try {
      const username = req.params.username as string;
      const slug = req.params.slug as string | undefined;
      const result = await cardService.getPublicCard(username, slug);

      const vcf = cardService.generateVCard({
        displayName: result.card.displayName,
        title: result.card.title,
        bio: result.card.bio,
        contactFields: result.card.contactFields as Record<
          string,
          string | undefined
        >,
        links: result.card.links as Array<{
          type: string;
          url: string;
          label: string;
        }>,
      });

      res.setHeader("Content-Type", "text/vcard");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${username}.vcf`,
      );
      res.send(vcf);
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },
};
