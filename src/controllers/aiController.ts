import type { Request, Response } from "express";
import prisma from "../db/prismaClient";
import { aiService } from "../services/ai/aiService";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";
import { askAISchema } from "../validators/askAISchema";

/**
 * Get AI summary for a meeting
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    const summary = await prisma.meetingAISummary.findUnique({
      where: { meetingId },
    });

    if (!summary) {
      res.status(404).json({
        success: false,
        message: "No AI summary found for this meeting",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error("Error getting summary:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Regenerate AI summary
 */
export const regenerateSummary = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    const transcript = await prisma.meetingTranscript.findFirst({
      where: { recording: { meetingId } },
    });

    if (!transcript) {
      res.status(400).json({
        success: false,
        message: "No transcript available. Upload a recording first.",
      });
      return;
    }

    const summary = await aiService.generateSummary(
      meetingId,
      transcript.fullText,
    );

    res.status(200).json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    logger.error("Error regenerating summary:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Get notes for a meeting
 */
export const getNotes = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;

    const notes = await prisma.meetingNote.findMany({
      where: { meetingId },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    logger.error("Error getting notes:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Create a note for a meeting
 */
export const createNote = async (req: Request, res: Response) => {
  try {
    const meetingId = req.params.meetingId as string;
    const { content, timestamp } = req.body;
    // Get user ID as author
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const note = await prisma.meetingNote.create({
      data: {
        meetingId,
        content,
        author: userId,
        timestamp: timestamp ? parseFloat(timestamp) : undefined,
      },
    });

    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    logger.error("Error creating note:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
 * Delete a note
 */
export const deleteNote = async (req: Request, res: Response) => {
  try {
    const noteId = req.params.noteId as string;

    await prisma.meetingNote.delete({
      where: { id: noteId },
    });

    res.status(200).json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting note:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
