import type { Response } from "express";
import type { AIContentType } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { getOpenAIClient } from "../../config/openai";
import { logger } from "../../utils/logging/logger";
import { AppError } from "../../utils/errors/AppError";
import { getRedisClient } from "../../config/redisClient";

const OPENAI_MODEL = "gpt-4o-mini";
const MAX_PIPELINE_CHARS = 40000; // ~10k tokens — keeps pipeline calls within context

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
    throw new AppError("OPENAI_API_KEY is required for AI features", 503);
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, isDeleted: false },
  });

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const prompt = `You are an AI assistant that summarizes meeting transcripts.
Provide a clear, professional summary of the following meeting transcript.
Focus on key decisions, discussion points, and outcomes.

Meeting Title: ${meeting?.title || "Untitled Meeting"}
Meeting Description: ${meeting?.description || "No description"}

Transcript:
${capped}

Provide a summary in 2-3 paragraphs.`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: "You are a professional meeting summarizer." },
      { role: "user", content: prompt },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const summary = response.choices[0]?.message?.content?.trim() ?? "";
  if (!summary) {
    throw new AppError("OpenAI returned empty summary content", 502);
  }

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
    throw new AppError("OPENAI_API_KEY is required for AI features", 503);
  }

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const prompt = `Extract the key points from this meeting transcript.
Return them as a JSON array of strings, with each key point being concise (1-2 sentences).
Focus on important decisions, agreements, and notable discussion items.

Transcript:
${capped}

Return ONLY a JSON array, no other text.`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
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

  const rawKeyPointsContent = response.choices[0]?.message?.content?.trim();
  if (!rawKeyPointsContent) {
    throw new AppError("OpenAI returned empty key points content", 502);
  }
  const content = rawKeyPointsContent;

  let keyPoints: string[];
  try {
    keyPoints = JSON.parse(stripMarkdownJson(content));
  } catch {
    logger.error("Failed to parse key points JSON", { rawContent: content.slice(0, 200) });
    return [];
  }

  // Update the summary with key points (separate from parse — let DB errors propagate)
  await prisma.meetingAISummary.upsert({
    where: { meetingId },
    create: {
      meetingId,
      summary: "",
      keyPoints,
    },
    update: {
      keyPoints,
      updatedAt: new Date(),
    },
  });

  logger.info(`Key points extracted for meeting ${meetingId}`);
  return keyPoints;
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
    throw new AppError("OPENAI_API_KEY is required for AI features", 503);
  }

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const prompt = `Extract action items and tasks from this meeting transcript.
Return them as a JSON array of objects with these fields:
- title: string (short, actionable task title)
- description: string (optional, more details)
- assigneeHint: string (optional, name/role of person responsible if mentioned)

Transcript:
${capped}

Return ONLY a JSON array, no other text.`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
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

  const rawTasksContent = response.choices[0]?.message?.content?.trim();
  if (!rawTasksContent) {
    throw new AppError("OpenAI returned empty tasks content", 502);
  }
  const content = rawTasksContent;

  let rawTasks: Array<{
    title: string;
    description?: string;
    assigneeHint?: string;
  }>;
  try {
    rawTasks = JSON.parse(stripMarkdownJson(content));
  } catch {
    logger.error("Failed to parse tasks JSON", { rawContent: content.slice(0, 200) });
    return [];
  }

  const tasks: ExtractedTask[] = rawTasks.map((item) => ({
    title: item.title,
    description: item.description,
    assigneeHint: item.assigneeHint,
  }));

  // Save tasks to database in a single transaction
  if (tasks.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        await tx.task.createMany({
          data: tasks.map((task) => ({
            meetingId,
            userId,
            title: task.title,
            description: task.description,
            source: "AI_EXTRACTED" as const,
          })),
        });
      },
      { timeout: 15000 },
    );
  }

  logger.info(`${tasks.length} tasks extracted for meeting ${meetingId}`);
  return tasks;
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

  let title: string | null = null;

  try {
    const prompt = `Based on this meeting transcript, generate a short, descriptive meeting title (4-7 words max).
The title should capture the main topic or purpose of the meeting.
Return ONLY the title text, nothing else.

Transcript (first 2000 chars):
${transcriptText.slice(0, 2000)}`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
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

    title = response.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error(`OpenAI title generation failed for meeting ${meetingId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!title) return null;

  try {
    // Update meeting title in DB
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { title },
    });
    logger.info(`Meeting ${meetingId} renamed to: "${title}"`);
  } catch (err) {
    logger.error(`DB write failed when saving generated title for meeting ${meetingId}`, {
      error: err instanceof Error ? err.message : String(err),
      title,
    });
  }

  return title;
};

/**
 * Process meeting with all AI features
 */
export const processTranscriptWithAI = async (
  meetingId: string,
  userId: string,
): Promise<AIProcessingResult> => {
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
  });

  if (!transcript) {
    throw new AppError(`No transcript found for meeting ${meetingId}`, 422);
  }

  // Title generation is genuinely fire-and-forget — run outside Promise.all so a
  // title failure cannot reject the entire pipeline.
  void generateMeetingTitle(meetingId, transcript.fullText).catch((err) =>
    logger.error("generateMeetingTitle failed (non-fatal)", {
      meetingId,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  const [summary, keyPoints, tasks] = await Promise.all([
    generateSummary(meetingId, transcript.fullText),
    extractKeyPoints(meetingId, transcript.fullText),
    extractTasks(meetingId, transcript.fullText, userId),
  ]);

  return {
    summary,
    keyPoints,
    tasks,
  };
};

const ASK_AI_RATE_LIMIT = 20; // max requests per user per hour

/**
 * Check and increment rate limit for Ask AI.
 * Uses Redis sliding window (hourly). Fails open if Redis is unavailable.
 */
const checkAskAIRateLimit = async (userId: string): Promise<void> => {
  try {
    const key = `ask_ai:${userId}:${Math.floor(Date.now() / 3_600_000)}`;
    const count = await getRedisClient().incr(key);
    if (count === 1) {
      await getRedisClient().expire(key, 3600);
    }
    if (count > ASK_AI_RATE_LIMIT) {
      throw new AppError(
        "Rate limit exceeded — max 20 Ask AI requests per hour",
        429,
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Redis unavailable — fail open
    logger.warn("Redis unavailable for Ask AI rate limit check", { userId });
  }
};

/**
 * Build transcript context string with speaker display names substituted.
 */
const buildTranscriptContext = (
  segments: { speaker: string; text: string; startTime: number }[],
  speakers: { speakerLabel: string; displayName: string | null }[],
): string => {
  const nameMap = new Map(
    speakers.map((s) => [s.speakerLabel, s.displayName ?? s.speakerLabel]),
  );
  return segments
    .map((seg) => `${nameMap.get(seg.speaker) ?? seg.speaker}: ${seg.text}`)
    .join("\n");
};

/**
 * Ask AI — streams an answer to a question about a specific meeting.
 * POST /sma/meetings/:meetingId/ask
 * Response: text/event-stream (SSE)
 */
export const askAI = async (
  meetingId: string,
  userId: string,
  question: string,
  res: Response,
): Promise<void> => {
  await checkAskAIRateLimit(userId);

  // Verify meeting belongs to user
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true, title: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  // Fetch transcript with segments (capped to avoid loading megabytes for long meetings)
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
    include: {
      segments: { orderBy: { startTime: "asc" }, take: 500 },
    },
  });

  if (!transcript || transcript.segments.length === 0) {
    throw new AppError("No transcript available for this meeting", 400);
  }

  // Fetch speakers for display name resolution
  const speakers = await prisma.meetingSpeaker.findMany({
    where: { meetingId },
    select: { speakerLabel: true, displayName: true },
  });

  const MAX_TRANSCRIPT_CHARS = 20000; // ~5k tokens — stay well within context
  const rawTranscript = buildTranscriptContext(transcript.segments, speakers);
  const transcriptContext =
    rawTranscript.length > MAX_TRANSCRIPT_CHARS
      ? rawTranscript.slice(0, MAX_TRANSCRIPT_CHARS) +
        "\n[transcript truncated]"
      : rawTranscript;

  const systemPrompt = `You are an intelligent meeting assistant. You have access to the full transcript of a meeting titled "${meeting.title ?? "Untitled Meeting"}".
Answer the user's questions based solely on the transcript content.
Be concise, accurate, and helpful. If the answer isn't in the transcript, say so clearly.`;

  const userMessage = `Transcript:\n${transcriptContext}\n\nQuestion: ${question}`;

  // Stream SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const openai = getOpenAIClient();

  try {
    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.5,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    logger.info("Ask AI completed", { meetingId, userId });
  } catch (err) {
    logger.error("Ask AI streaming error", {
      error: err instanceof Error ? err.message : String(err),
      meetingId,
      userId,
    });
    res.write(`data: ${JSON.stringify({ error: "AI response failed" })}\n\n`);
    res.end();
  }
};

// ── AI Content Generation ──────────────────────────────────────────────────

const CONTENT_PROMPTS: Record<AIContentType, (transcript: string) => string> = {
  MEETING_REPORT: (t) =>
    `Based on this meeting transcript, write a formal meeting report/minutes document. Include: Participants (from who's speaking), Key Discussion Points, Decisions Made, and Action Items. Format it professionally with clear sections.\n\nTranscript:\n${t}\n\nMeeting Report:`,

  TWEET: (t) =>
    `Write a single tweet (under 280 characters) that captures the main outcome or topic of this meeting. Be engaging and professional.\n\nTranscript excerpt:\n${t.slice(0, 3000)}\n\nTweet:`,

  BLOG_POST: (t) =>
    `Write a 300-400 word blog post about the topic discussed in this meeting. Give it a compelling title. Make it engaging and informative for a professional audience.\n\nTranscript:\n${t}\n\nBlog Post:`,

  EMAIL: (t) =>
    `Write a professional follow-up email to send to meeting participants. Include: brief summary of what was discussed, key decisions made, action items (with owners if mentioned), and a professional closing. Write only the email body — no subject line or headers.\n\nTranscript:\n${t}\n\nFollow-up Email:`,
};

/**
 * Generate structured content from a meeting transcript.
 * Returns cached result if already generated for this (meetingId, type) pair.
 */
export const generateContent = async (
  meetingId: string,
  userId: string,
  type: AIContentType,
): Promise<string> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new AppError("OPENAI_API_KEY is required for AI features", 500);
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  // Return cached result if it exists
  const cached = await prisma.meetingAIContent.findUnique({
    where: { meetingId_type: { meetingId, type } },
  });
  if (cached) return cached.content;

  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
  });
  if (!transcript) {
    throw new AppError(
      "No transcript available. Upload a recording first.",
      400,
    );
  }

  const openai = getOpenAIClient();
  const capped = transcript.fullText.slice(0, MAX_PIPELINE_CHARS);
  const prompt = CONTENT_PROMPTS[type](capped);

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a professional meeting assistant that generates well-structured content from meeting transcripts. Be concise, accurate, and professional.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: type === "TWEET" ? 100 : 1500,
    temperature: 0.6,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new AppError("OpenAI returned empty content", 502);
  }

  await prisma.meetingAIContent.upsert({
    where: { meetingId_type: { meetingId, type } },
    create: { meetingId, type, content },
    update: { content, updatedAt: new Date() },
  });

  logger.info(`Generated ${type} content for meeting ${meetingId}`);
  return content;
};

/**
 * Get all previously generated content for a meeting.
 */
export const getGeneratedContents = async (
  meetingId: string,
  userId: string,
): Promise<{ type: string; content: string }[]> => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  return prisma.meetingAIContent.findMany({
    where: { meetingId },
    select: { type: true, content: true },
    take: 50,
  });
};

export const aiService = {
  generateSummary,
  extractKeyPoints,
  extractTasks,
  generateMeetingTitle,
  processTranscriptWithAI,
  askAI,
  generateContent,
  getGeneratedContents,
};
