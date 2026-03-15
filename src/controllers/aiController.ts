import type { Request, Response } from "express";
import prisma from "../db/prismaClient";
import { aiService } from "../services/ai/aiService";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";
import { askAISchema } from "../validators/askAISchema";
import { generateContentSchema } from "../validators/generateContentSchema";
import { apiResponse } from "../utils/globalResponseHandler";

/**
 * Get AI summary for a meeting
 */
export const getSummary = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const summary = await prisma.meetingAISummary.findUnique({
    where: { meetingId },
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
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const transcript = await prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
  });
  if (!transcript) {
    throw new AppError(
      "No transcript available. Upload a recording first.",
      422,
    );
  }

  const [summary, keyPoints] = await Promise.all([
    aiService.generateSummary(meetingId, transcript.fullText),
    aiService.extractKeyPoints(meetingId, transcript.fullText),
  ]);

  apiResponse(res, {
    statusCode: 200,
    message: "Summary regenerated",
    data: { summary, keyPoints },
  });
};

/**
 * Regenerate meeting title from transcript
 * POST /sma/meetings/:meetingId/title/regenerate
 */
export const regenerateTitle = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const transcript = await prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
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
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const notes = await prisma.meetingNote.findMany({
    where: { meetingId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return apiResponse(res, {
    statusCode: 200,
    message: "Notes fetched",
    data: notes,
  });
};

/**
 * Create a note for a meeting
 */
export const createNote = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const userId = req.user?.userId;

  if (!userId) throw new AppError("Unauthorized", 401);

  const { z } = await import("zod");
  const noteSchema = z.object({
    content: z.string().min(1).max(10000),
    timestamp: z.number().optional(),
  });
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
      meeting: { createdById: userId, isDeleted: false },
    },
    select: { id: true },
  });
  if (!note) throw new AppError("Note not found", 404);

  await prisma.meetingNote.delete({ where: { id: noteId } });

  return apiResponse(res, {
    statusCode: 200,
    message: "Note deleted successfully",
  });
};
