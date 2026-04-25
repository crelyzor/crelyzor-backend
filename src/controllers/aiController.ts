import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../db/prismaClient";
import { aiService } from "../services/ai/aiService";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";
import { askAISchema } from "../validators/askAISchema";
import { generateContentSchema } from "../validators/generateContentSchema";
import { noteSchema } from "../validators/noteSchema";
import { apiResponse } from "../utils/globalResponseHandler";
import * as conversationService from "../services/ai/askAIConversationService";

const notesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const uuidSchema = z.string().uuid();

/**
 * Get AI summary for a meeting
 */
export const getSummary = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const summary = await prisma.meetingAISummary.findFirst({
    where: { meetingId, isDeleted: false },
  });

  if (!summary) throw new AppError("No AI summary found for this meeting", 404);

  return apiResponse(res, {
    statusCode: 200,
    message: "Summary fetched",
    data: summary,
  });
};

/**
 * Regenerate AI summary + key points
 * POST /sma/meetings/:meetingId/summary/regenerate
 */
export const regenerateSummary = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
  });
  if (!transcript) {
    throw new AppError(
      "No transcript available. Upload a recording first.",
      422,
    );
  }

  await aiService.generateSummaryAndKeyPoints(meetingId, transcript.fullText, {
    requireKeyPoints: true,
  });

  const updatedSummary = await prisma.meetingAISummary.findFirst({
    where: { meetingId, isDeleted: false },
  });

  apiResponse(res, {
    statusCode: 200,
    message: "Summary regenerated",
    data: updatedSummary,
  });
};

/**
 * Regenerate meeting title from transcript
 * POST /sma/meetings/:meetingId/title/regenerate
 */
export const regenerateTitle = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
  });
  if (!transcript) {
    throw new AppError(
      "No transcript available. Upload a recording first.",
      422,
    );
  }

  const title = await aiService.generateMeetingTitle(
    meetingId,
    transcript.fullText,
  );
  if (!title) throw new AppError("Failed to generate title", 500);

  logger.info("Title regenerated", { meetingId, userId, title });
  apiResponse(res, {
    statusCode: 200,
    message: "Title regenerated",
    data: { title },
  });
};

/**
 * Get notes for a meeting
 */
export const getNotes = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const parsedQuery = notesQuerySchema.safeParse(req.query);
  const { limit, offset } = parsedQuery.success
    ? parsedQuery.data
    : { limit: 50, offset: 0 };

  const [notes, total] = await Promise.all([
    prisma.meetingNote.findMany({
      where: { meetingId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.meetingNote.count({ where: { meetingId, isDeleted: false } }),
  ]);

  return apiResponse(res, {
    statusCode: 200,
    message: "Notes fetched",
    data: { notes, pagination: { total, limit, offset } },
  });
};

/**
 * Create a note for a meeting
 */
export const createNote = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success)
    throw new AppError("content is required (max 10000 chars)", 400);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const note = await prisma.meetingNote.create({
    data: {
      meetingId,
      content: parsed.data.content,
      author: userId,
      timestamp: parsed.data.timestamp,
    },
  });

  return apiResponse(res, {
    statusCode: 201,
    message: "Note created",
    data: note,
  });
};

/**
 * POST /sma/meetings/:meetingId/ask
 * Streams an AI answer about the meeting via SSE.
 */
export const askAI = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const validated = askAISchema.safeParse(req.body);
  if (!validated.success) {
    throw new AppError(
      "Validation failed: question is required (max 1000 chars)",
      400,
    );
  }

  // askAI handles its own response (SSE stream) — do not use apiResponse here
  await aiService.askAI(meetingId, userId, validated.data.question, res);
};

/**
 * POST /sma/meetings/:meetingId/generate
 * Generate structured content from transcript (cached per type).
 */
export const generateContent = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;
  if (!userId) throw new AppError("Unauthorized", 401);

  const validated = generateContentSchema.safeParse(req.body);
  if (!validated.success) {
    throw new AppError("Validation failed: valid type is required", 400);
  }

  const content = await aiService.generateContent(
    meetingId,
    userId,
    validated.data.type,
  );

  apiResponse(res, {
    statusCode: 200,
    message: "Content generated",
    data: { type: validated.data.type, content },
  });
};

/**
 * GET /sma/meetings/:meetingId/generated
 * Return all previously generated content for a meeting.
 */
export const getGeneratedContents = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;
  if (!userId) throw new AppError("Unauthorized", 401);

  const contents = await aiService.getGeneratedContents(meetingId, userId);
  apiResponse(res, {
    statusCode: 200,
    message: "Generated contents fetched",
    data: { contents },
  });
};

/**
 * Delete a note
 */
export const deleteNote = async (req: Request, res: Response) => {
  const noteId = req.params.noteId as string;
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  // Verify the note belongs to a meeting owned by the caller
  const note = await prisma.meetingNote.findFirst({
    where: {
      id: noteId,
      isDeleted: false,
      meeting: { createdById: userId, isDeleted: false },
    },
    select: { id: true },
  });
  if (!note) throw new AppError("Note not found", 404);

  await prisma.meetingNote.update({
    where: { id: noteId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return apiResponse(res, {
    statusCode: 200,
    message: "Note deleted successfully",
  });
};

/**
 * GET /sma/meetings/:meetingId/ask/history
 * Return all persisted Ask AI messages for this meeting (oldest → newest).
 */
export const getAskAIHistory = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;
  if (!userId) throw new AppError("Unauthorized", 401);

  // Verify the meeting belongs to the caller
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const messages = await conversationService.getMessages(userId, meetingId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Ask AI history fetched",
    data: { messages },
  });
};

/**
 * DELETE /sma/meetings/:meetingId/ask/history
 * Clear all Ask AI messages for this meeting.
 */
export const clearAskAIHistory = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user?.userId;
  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  await conversationService.clearMessages(userId, meetingId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Ask AI history cleared",
  });
};
