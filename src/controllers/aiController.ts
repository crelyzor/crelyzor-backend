import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../db/prismaClient";
import { aiService } from "../services/ai/aiService";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";
import { askAISchema } from "../validators/askAISchema";
import { generateContentSchema } from "../validators/generateContentSchema";
import { noteSchema, notesQuerySchema } from "../validators/noteSchema";
import { apiResponse } from "../utils/globalResponseHandler";
import * as conversationService from "../services/ai/askAIConversationService";
import { encrypt, decrypt } from "../utils/security/crypto";

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

  const [summaryText, keyPoints] = await Promise.all([
    decrypt(summary.summary, userId),
    summary.keyPoints
      ? decrypt(summary.keyPoints, userId)
          .then((s) => {
            try {
              return JSON.parse(s) as string[];
            } catch {
              return [] as string[];
            }
          })
          .catch((err) => {
            logger.warn("Failed to decrypt keyPoints", {
              meetingId,
              error: err instanceof Error ? err.message : String(err),
            });
            return [] as string[];
          })
      : Promise.resolve([] as string[]),
  ]);

  return apiResponse(res, {
    statusCode: 200,
    message: "Summary fetched",
    data: { ...summary, summary: summaryText, keyPoints },
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

  const fullText = transcript.fullText
    ? await decrypt(transcript.fullText, userId)
    : "";

  const { summary: summaryText, keyPoints } =
    await aiService.generateSummaryAndKeyPoints(meetingId, fullText, userId, {
      requireKeyPoints: true,
    });

  return apiResponse(res, {
    statusCode: 200,
    message: "Summary regenerated",
    data: { summary: summaryText, keyPoints },
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

  const transcriptFullText = transcript.fullText
    ? await decrypt(transcript.fullText, userId)
    : "";
  const title = await aiService.generateMeetingTitle(
    meetingId,
    transcriptFullText,
  );
  if (!title) throw new AppError("Failed to generate title", 500);

  logger.info("Title regenerated", { meetingId, userId, title });
  return apiResponse(res, {
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

  const NOTE_SELECT = {
    id: true,
    meetingId: true,
    content: true,
    author: true,
    timestamp: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  const [rawNotes, total] = await Promise.all([
    prisma.meetingNote.findMany({
      where: { meetingId, author: userId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: NOTE_SELECT,
    }),
    prisma.meetingNote.count({
      where: { meetingId, author: userId, isDeleted: false },
    }),
  ]);

  const notes = await Promise.all(
    rawNotes.map(async (note) => ({
      ...note,
      content: await decrypt(note.content, userId),
    })),
  );

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

  const encryptedContent = await encrypt(parsed.data.content, userId);
  const note = await prisma.meetingNote.create({
    data: {
      meetingId,
      content: encryptedContent,
      author: userId,
      timestamp: parsed.data.timestamp,
    },
    select: {
      id: true,
      meetingId: true,
      content: true,
      author: true,
      timestamp: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return apiResponse(res, {
    statusCode: 201,
    message: "Note created",
    data: { ...note, content: parsed.data.content },
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

  return apiResponse(res, {
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
  return apiResponse(res, {
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
  if (!uuidSchema.safeParse(noteId).success)
    throw new AppError("Invalid noteId", 400);
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

  const deleted = await prisma.meetingNote.updateMany({
    where: {
      id: noteId,
      isDeleted: false,
      meeting: { createdById: userId, isDeleted: false },
    },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  if (deleted.count === 0) throw new AppError("Note not found", 404);

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
