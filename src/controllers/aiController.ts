import type { Request, Response } from "express";
import prisma from "../db/prismaClient";
import { aiService } from "../services/ai/aiService";
import { logger } from "../utils/logging/logger";
import { ActionItemCategory } from "@prisma/client";

/**
 * Get AI summary for a meeting
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;

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
    const { meetingId } = req.params;

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

    const summary = await aiService.generateSummary(meetingId, transcript.fullText);

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
 * Get action items for a meeting
 */
export const getActionItems = async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;

    const actionItems = await prisma.meetingActionItem.findMany({
      where: { meetingId },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: actionItems,
    });
  } catch (error) {
    logger.error("Error getting action items:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Update action item
 */
export const updateActionItem = async (req: Request, res: Response) => {
  try {
    const { actionItemId } = req.params;
    const { title, description, category, assignedTo, suggestedStartDate, suggestedEndDate } = req.body;

    const actionItem = await prisma.meetingActionItem.update({
      where: { id: actionItemId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(category && { category: category as ActionItemCategory }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(suggestedStartDate && { suggestedStartDate: new Date(suggestedStartDate) }),
        ...(suggestedEndDate && { suggestedEndDate: new Date(suggestedEndDate) }),
      },
    });

    res.status(200).json({
      success: true,
      data: actionItem,
    });
  } catch (error) {
    logger.error("Error updating action item:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Create a manual action item
 */
export const createActionItem = async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const { title, description, category, suggestedStartDate, suggestedEndDate, assignedTo } = req.body;
    // Get user ID as owner
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const actionItem = await prisma.meetingActionItem.create({
      data: {
        meetingId,
        title,
        description,
        owner: userId,
        category: (category as ActionItemCategory) || ActionItemCategory.OTHER,
        suggestedStartDate: suggestedStartDate ? new Date(suggestedStartDate) : undefined,
        suggestedEndDate: suggestedEndDate ? new Date(suggestedEndDate) : undefined,
        assignedTo,
      },
    });

    res.status(201).json({
      success: true,
      data: actionItem,
    });
  } catch (error) {
    logger.error("Error creating action item:", {
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
    const { meetingId } = req.params;

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
    const { meetingId } = req.params;
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
 * Delete a note
 */
export const deleteNote = async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;

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
