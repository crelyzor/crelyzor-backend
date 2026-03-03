import OpenAI from "openai";
import prisma from "../../db/prismaClient";
import { logger } from "../../utils/logging/logger";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIProcessingResult {
  summary?: string;
  keyPoints?: string[];
  tasks?: ExtractedTask[];
}

export interface ExtractedTask {
  title: string;
  description?: string;
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
    const keyPoints = JSON.parse(stripMarkdownJson(content));

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

/** Strip markdown code fences that GPT sometimes wraps JSON in */
const stripMarkdownJson = (content: string): string => {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return content.trim();
};

/**
 * Extract tasks from transcript and save as Task records
 */
export const extractTasks = async (
  meetingId: string,
  transcriptText: string,
  userId: string,
): Promise<ExtractedTask[]> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI features");
  }

  const prompt = `Extract action items and tasks from this meeting transcript.
Return them as a JSON array of objects with these fields:
- title: string (short, actionable task title)
- description: string (optional, more details)
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
          "You extract tasks from meeting transcripts and return them as JSON.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "[]";

  try {
    const rawTasks = JSON.parse(stripMarkdownJson(content)) as Array<{
      title: string;
      description?: string;
      assigneeHint?: string;
    }>;

    const tasks: ExtractedTask[] = rawTasks.map((item) => ({
      title: item.title,
      description: item.description,
      assigneeHint: item.assigneeHint,
    }));

    // Save tasks to database
    for (const task of tasks) {
      await prisma.task.create({
        data: {
          meetingId,
          userId,
          title: task.title,
          description: task.description,
          source: "AI_EXTRACTED",
        },
      });
    }

    logger.info(`${tasks.length} tasks extracted for meeting ${meetingId}`);

    return tasks;
  } catch {
    logger.error("Failed to parse tasks JSON");
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
  userId: string,
): Promise<AIProcessingResult> => {
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
  });

  if (!transcript) {
    throw new Error(`No transcript found for meeting ${meetingId}`);
  }

  const [summary, keyPoints, tasks] = await Promise.all([
    generateSummary(meetingId, transcript.fullText),
    extractKeyPoints(meetingId, transcript.fullText),
    extractTasks(meetingId, transcript.fullText, userId),
    generateMeetingTitle(meetingId, transcript.fullText),
  ]);

  return {
    summary,
    keyPoints,
    tasks,
  };
};

export const aiService = {
  generateSummary,
  extractKeyPoints,
  extractTasks,
  generateMeetingTitle,
  processTranscriptWithAI,
};
