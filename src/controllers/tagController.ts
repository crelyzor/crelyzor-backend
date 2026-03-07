import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { logger } from "../utils/logging/logger";
import {
  createTagSchema,
  updateTagSchema,
  tagParamSchema,
  meetingIdParamSchema,
  cardIdParamSchema,
  tagMeetingParamSchema,
  tagCardParamSchema,
} from "../validators/tagSchema";
import * as tagService from "../services/tagService";

// ────────────────────────────────────────────────────────────
// Tag CRUD
// ────────────────────────────────────────────────────────────

/**
 * GET /tags
 */
export const listTags = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tags = await tagService.listTags(userId);

  return apiResponse(res, { statusCode: 200, message: "Tags fetched", data: { tags } });
};

/**
 * POST /tags
 */
export const createTag = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = createTagSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const tag = await tagService.createTag(userId, validated.data);

  logger.info("Tag created", { tagId: tag.id, userId });

  return apiResponse(res, { statusCode: 201, message: "Tag created", data: { tag } });
};

/**
 * PATCH /tags/:tagId
 */
export const updateTag = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = tagParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid tag ID", 400);

  const validated = updateTagSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const tag = await tagService.updateTag(userId, params.data.tagId, validated.data);

  logger.info("Tag updated", { tagId: tag.id, userId });

  return apiResponse(res, { statusCode: 200, message: "Tag updated", data: { tag } });
};

/**
 * DELETE /tags/:tagId
 */
export const deleteTag = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = tagParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid tag ID", 400);

  await tagService.deleteTag(userId, params.data.tagId);

  logger.info("Tag deleted", { tagId: params.data.tagId, userId });

  return apiResponse(res, { statusCode: 200, message: "Tag deleted" });
};

// ────────────────────────────────────────────────────────────
// Meeting tags
// ────────────────────────────────────────────────────────────

/**
 * GET /meetings/:meetingId/tags
 */
export const getMeetingTags = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = meetingIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid meeting ID", 400);

  const tags = await tagService.getMeetingTags(userId, params.data.meetingId);

  return apiResponse(res, { statusCode: 200, message: "Meeting tags fetched", data: { tags } });
};

/**
 * POST /meetings/:meetingId/tags/:tagId
 */
export const attachTagToMeeting = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = tagMeetingParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid parameters", 400);

  await tagService.attachTagToMeeting(userId, params.data.meetingId, params.data.tagId);

  return apiResponse(res, { statusCode: 200, message: "Tag attached to meeting" });
};

/**
 * DELETE /meetings/:meetingId/tags/:tagId
 */
export const detachTagFromMeeting = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = tagMeetingParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid parameters", 400);

  await tagService.detachTagFromMeeting(userId, params.data.meetingId, params.data.tagId);

  return apiResponse(res, { statusCode: 200, message: "Tag removed from meeting" });
};

// ────────────────────────────────────────────────────────────
// Card tags
// ────────────────────────────────────────────────────────────

/**
 * GET /cards/:cardId/tags
 */
export const getCardTags = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = cardIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid card ID", 400);

  const tags = await tagService.getCardTags(userId, params.data.cardId);

  return apiResponse(res, { statusCode: 200, message: "Card tags fetched", data: { tags } });
};

/**
 * POST /cards/:cardId/tags/:tagId
 */
export const attachTagToCard = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = tagCardParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid parameters", 400);

  await tagService.attachTagToCard(userId, params.data.cardId, params.data.tagId);

  return apiResponse(res, { statusCode: 200, message: "Tag attached to card" });
};

/**
 * DELETE /cards/:cardId/tags/:tagId
 */
export const detachTagFromCard = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = tagCardParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid parameters", 400);

  await tagService.detachTagFromCard(userId, params.data.cardId, params.data.tagId);

  return apiResponse(res, { statusCode: 200, message: "Tag removed from card" });
};
