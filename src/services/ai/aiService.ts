import OpenAI from "openai";
import prisma from "../../db/prismaClient";
import { logger } from "../../utils/logging/logger";
import { ActionItemCategory } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIProcessingResult {
  summary?: string;
  keyPoints?: string[];
  actionItems?: ActionItemResult[];
}

export interface ActionItemResult {
  title: string;
  description?: string;
  category: ActionItemCategory;
  suggestedStartDate?: Date;
  suggestedEndDate?: Date;
  assigneeHint?: string;
}

/**
 * Generate AI summary from transcript
 */
export const generateSummary = async (
  meetingId: string,
  transcriptText: string,
): Promise<string> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI features");
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  const prompt = `You are an AI assistant that summarizes meeting transcripts. 
Provide a clear, professional summary of the following meeting transcript.
Focus on key decisions, discussion points, and outcomes.

Meeting Title: ${meeting?.title || "Untitled Meeting"}
Meeting Description: ${meeting?.description || "No description"}

Transcript:
${transcriptText}

Provide a summary in 2-3 paragraphs.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional meeting summarizer." },
      { role: "user", content: prompt },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const summary = response.choices[0]?.message?.content || "";

  // Save summary to database
  await prisma.meetingAISummary.upsert({
    where: { meetingId },
    create: {
      meetingId,
      summary,
    },
    update: {
      summary,
      updatedAt: new Date(),
    },
  });

  logger.info(`Summary generated for meeting ${meetingId}`);

  return summary;
};

/**
 * Extract key points from transcript
 */
export const extractKeyPoints = async (
  meetingId: string,
  transcriptText: string,
): Promise<string[]> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI features");
  }

  const prompt = `Extract the key points from this meeting transcript.
Return them as a JSON array of strings, with each key point being concise (1-2 sentences).
Focus on important decisions, agreements, and notable discussion items.

Transcript:
${transcriptText}

Return ONLY a JSON array, no other text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You extract key points from meetings and return them as JSON.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "[]";

  try {
    const keyPoints = JSON.parse(content);

    // Update the summary with key points
    await prisma.meetingAISummary.upsert({
      where: { meetingId },
      create: {
        meetingId,
        summary: "",
        keyPoints: keyPoints,
      },
      update: {
        keyPoints: keyPoints,
        updatedAt: new Date(),
      },
    });

    logger.info(`Key points extracted for meeting ${meetingId}`);

    return keyPoints;
  } catch {
    logger.error("Failed to parse key points JSON");
    return [];
  }
};

/**
 * Map AI category string to ActionItemCategory enum
 */
const mapToActionItemCategory = (category: string): ActionItemCategory => {
  const categoryMap: Record<string, ActionItemCategory> = {
    PARTICIPANT_TASK: ActionItemCategory.PARTICIPANT_TASK,
    SHARED_TASK: ActionItemCategory.SHARED_TASK,
    DOCUMENT_REQUIRED: ActionItemCategory.DOCUMENT_REQUIRED,
    UPCOMING_EVENT: ActionItemCategory.UPCOMING_EVENT,
    TASK: ActionItemCategory.PARTICIPANT_TASK,
    FOLLOW_UP: ActionItemCategory.SHARED_TASK,
    DECISION: ActionItemCategory.OTHER,
    RESEARCH: ActionItemCategory.OTHER,
  };
  return categoryMap[category.toUpperCase()] || ActionItemCategory.OTHER;
};

/**
 * Extract action items from transcript
 */
export const extractActionItems = async (
  meetingId: string,
  transcriptText: string,
  ownerId: string,
): Promise<ActionItemResult[]> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI features");
  }

  const prompt = `Extract action items from this meeting transcript.
Return them as a JSON array of objects with these fields:
- title: string (short action item title)
- description: string (optional, more details)
- category: string (one of: "PARTICIPANT_TASK", "SHARED_TASK", "DOCUMENT_REQUIRED", "UPCOMING_EVENT", "OTHER")
- assigneeHint: string (optional, name/role of person responsible if mentioned)

Transcript:
${transcriptText}

Return ONLY a JSON array, no other text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You extract action items from meetings and return them as JSON.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "[]";

  try {
    const rawActionItems = JSON.parse(content) as Array<{
      title: string;
      description?: string;
      category?: string;
      assigneeHint?: string;
    }>;

    const actionItems: ActionItemResult[] = rawActionItems.map((item) => ({
      title: item.title,
      description: item.description,
      category: mapToActionItemCategory(item.category || "OTHER"),
      assigneeHint: item.assigneeHint,
    }));

    // Save action items to database
    for (const item of actionItems) {
      await prisma.meetingActionItem.create({
        data: {
          meetingId,
          title: item.title,
          description: item.description,
          owner: ownerId,
          category: item.category,
        },
      });
    }

    logger.info(
      `${actionItems.length} action items extracted for meeting ${meetingId}`,
    );

    return actionItems;
  } catch {
    logger.error("Failed to parse action items JSON");
    return [];
  }
};

/**
 * Generate a short, meaningful meeting title from transcript
 * Called after transcription — silently replaces the timestamp default title
 */
export const generateMeetingTitle = async (
  meetingId: string,
  transcriptText: string,
): Promise<string | null> => {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const prompt = `Based on this meeting transcript, generate a short, descriptive meeting title (4-7 words max).
The title should capture the main topic or purpose of the meeting.
Return ONLY the title text, nothing else.

Transcript (first 2000 chars):
${transcriptText.slice(0, 2000)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate concise, professional meeting titles. Return only the title, no quotes or punctuation at the end.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 30,
      temperature: 0.4,
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (!title) return null;

    // Update meeting title in DB
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { title },
    });

    logger.info(`Meeting ${meetingId} renamed to: "${title}"`);
    return title;
  } catch (err) {
    logger.warn(`Failed to generate title for meeting ${meetingId}:`, err);
    return null;
  }
};

/**
 * Process meeting with all AI features
 */
export const processTranscriptWithAI = async (
  meetingId: string,
  ownerId: string,
): Promise<AIProcessingResult> => {
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
  });

  if (!transcript) {
    throw new Error(`No transcript found for meeting ${meetingId}`);
  }

  const [summary, keyPoints, actionItems] = await Promise.all([
    generateSummary(meetingId, transcript.fullText),
    extractKeyPoints(meetingId, transcript.fullText),
    extractActionItems(meetingId, transcript.fullText, ownerId),
    generateMeetingTitle(meetingId, transcript.fullText),
  ]);

  return {
    summary,
    keyPoints,
    actionItems,
  };
};

export const aiService = {
  generateSummary,
  extractKeyPoints,
  extractActionItems,
  generateMeetingTitle,
  processTranscriptWithAI,
};
