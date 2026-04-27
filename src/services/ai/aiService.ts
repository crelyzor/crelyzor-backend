import type { Response } from "express";
import type { AIContentType } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { getGeminiModel, GEMINI_MODEL } from "../../config/gemini";
import { logger } from "../../utils/logging/logger";
import { AppError } from "../../utils/errors/AppError";
import { getRedisClient } from "../../config/redisClient";
import { checkAndDeductCredits } from "../billing/usageService";
import * as conversationService from "./askAIConversationService";

const MAX_PIPELINE_CHARS = 150000; // ~37.5k tokens — Gemini 1M context handles full meetings
const MAX_ASK_AI_CHARS = 50000; // ~12.5k tokens for Ask AI context

type AIUsageStats = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

type AIUsageMeta = {
  operation: string;
  model: string;
  promptChars: number;
  completionChars: number;
  usage?: AIUsageStats;
  streamed?: boolean;
};

const estimateTokensFromChars = (chars: number): number =>
  Math.max(1, Math.ceil(chars / 4));

const logAIUsage = (meta: AIUsageMeta): void => {
  const estimatedPromptTokens = estimateTokensFromChars(meta.promptChars);
  const estimatedCompletionTokens = estimateTokensFromChars(
    meta.completionChars,
  );

  logger.info("Gemini token usage", {
    operation: meta.operation,
    model: meta.model,
    streamed: meta.streamed ?? false,
    promptChars: meta.promptChars,
    completionChars: meta.completionChars,
    promptTokens: meta.usage?.promptTokenCount ?? estimatedPromptTokens,
    completionTokens:
      meta.usage?.candidatesTokenCount ?? estimatedCompletionTokens,
    totalTokens:
      meta.usage?.totalTokenCount ??
      estimatedPromptTokens + estimatedCompletionTokens,
    usageSource: meta.usage?.totalTokenCount ? "gemini" : "estimated",
  });
};

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

export interface SummaryAndKeyPointsResult {
  summary: string;
  keyPoints: string[];
}

export const generateSummary = async (
  meetingId: string,
  transcriptText: string,
): Promise<string> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("GEMINI_API_KEY is required for AI features", 503);
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, isDeleted: false },
  });

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const systemContent = "You are a professional meeting summarizer. Always respond in the same language as the transcript.";
  const prompt = `You are an AI assistant that summarizes meeting transcripts.
Provide a clear, professional summary of the following meeting transcript.
Focus on key decisions, discussion points, and outcomes.
Respond in the same language as the transcript.

Meeting Title: ${meeting?.title || "Untitled Meeting"}
Meeting Description: ${meeting?.description || "No description"}

Transcript:
${capped}

Provide a summary in 2-3 paragraphs.`;

  const model = getGeminiModel();
  const result = await model.generateContent({
    systemInstruction: systemContent,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.3 },
  });

  const summary = result.response.text().trim();
  if (!summary) {
    throw new AppError("Gemini returned empty summary content", 502);
  }

  logAIUsage({
    operation: "generateSummary",
    model: GEMINI_MODEL,
    promptChars: systemContent.length + prompt.length,
    completionChars: summary.length,
    usage: result.response.usageMetadata,
  });

  await prisma.meetingAISummary.upsert({
    where: { meetingId },
    create: { meetingId, summary },
    update: { summary, updatedAt: new Date() },
  });

  logger.info(`Summary generated for meeting ${meetingId}`);
  return summary;
};

export const extractKeyPoints = async (
  meetingId: string,
  transcriptText: string,
): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("GEMINI_API_KEY is required for AI features", 503);
  }

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const systemContent =
    "You extract key points from meetings and return them as JSON. Always respond in the same language as the transcript.";
  const prompt = `Extract the key points from this meeting transcript.
Return them as a JSON array of strings, with each key point being concise (1-2 sentences).
Focus on important decisions, agreements, and notable discussion items.
Respond in the same language as the transcript.

Transcript:
${capped}

Return ONLY a JSON array, no other text.`;

  const model = getGeminiModel();
  const result = await model.generateContent({
    systemInstruction: systemContent,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.3 },
  });

  const rawContent = result.response.text().trim();
  if (!rawContent) {
    throw new AppError("Gemini returned empty key points content", 502);
  }

  logAIUsage({
    operation: "extractKeyPoints",
    model: GEMINI_MODEL,
    promptChars: systemContent.length + prompt.length,
    completionChars: rawContent.length,
    usage: result.response.usageMetadata,
  });

  let keyPoints: string[];
  try {
    keyPoints = JSON.parse(stripMarkdownJson(rawContent));
  } catch {
    logger.error("Failed to parse key points JSON", {
      rawContent: rawContent.slice(0, 200),
    });
    throw new AppError(
      "Failed to parse key points JSON from Gemini response",
      502,
    );
  }

  await prisma.meetingAISummary.upsert({
    where: { meetingId },
    create: { meetingId, summary: "", keyPoints },
    update: { keyPoints, updatedAt: new Date() },
  });

  logger.info(`Key points extracted for meeting ${meetingId}`);
  return keyPoints;
};

/** Strip markdown code fences that models sometimes wrap JSON in */
const stripMarkdownJson = (content: string): string => {
  // Try complete fence first
  const complete = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (complete) return complete[1].trim();
  // Handle truncated response — fence opened but never closed (token limit hit)
  const opened = content.match(/```(?:json)?\s*([\s\S]+)/);
  if (opened) return opened[1].trim();
  return content.trim();
};

const deriveKeyPointsFromSummary = (summary: string): string[] => {
  return summary
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, ""))
    .filter((line) => line.length >= 24)
    .slice(0, 6);
};

export const generateSummaryAndKeyPoints = async (
  meetingId: string,
  transcriptText: string,
  options?: { requireKeyPoints?: boolean },
): Promise<SummaryAndKeyPointsResult> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("GEMINI_API_KEY is required for AI features", 503);
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, isDeleted: false },
    select: { title: true, description: true },
  });

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const systemContent =
    "You are a professional meeting summarizer. Always return valid JSON. Always respond in the same language as the transcript.";
  const prompt = `You are an AI assistant that summarizes meeting transcripts.
Return ONLY valid JSON with this exact shape:
{
  "summary": "string",
  "keyPoints": ["string", "string"]
}

Rules:
- summary: 2-3 professional paragraphs, focused on decisions and outcomes.
- keyPoints: 4-8 concise bullets as plain strings.
- Respond in the same language as the transcript.

Meeting Title: ${meeting?.title ?? "Untitled Meeting"}
Meeting Description: ${meeting?.description ?? "No description"}

Transcript:
${capped}`;

  const model = getGeminiModel();
  const result = await model.generateContent({
    systemInstruction: systemContent,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 2000, temperature: 0.3 },
  });

  const raw = result.response.text().trim();
  if (!raw) {
    throw new AppError("Gemini returned empty summary content", 502);
  }

  logAIUsage({
    operation: "generateSummaryAndKeyPoints",
    model: GEMINI_MODEL,
    promptChars: systemContent.length + prompt.length,
    completionChars: raw.length,
    usage: result.response.usageMetadata,
  });

  let summary = "";
  let keyPoints: string[] = [];
  try {
    const parsed = JSON.parse(stripMarkdownJson(raw)) as {
      summary?: unknown;
      keyPoints?: unknown;
    };

    summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    if (!summary) {
      throw new Error("Parsed summary is empty");
    }
  } catch (err) {
    logger.warn("Single-call summary parse failed — using fallback", {
      meetingId,
      error: err instanceof Error ? err.message : String(err),
    });

    summary = await generateSummary(meetingId, transcriptText);
    keyPoints = [];
    try {
      keyPoints = await extractKeyPoints(meetingId, transcriptText);
    } catch (keyPointErr) {
      if (options?.requireKeyPoints) {
        throw new AppError("Failed to extract key points", 502);
      }
      logger.error("Fallback key-point extraction failed (non-fatal)", {
        meetingId,
        error:
          keyPointErr instanceof Error
            ? keyPointErr.message
            : String(keyPointErr),
      });
    }
  }

  await prisma.meetingAISummary.upsert({
    where: { meetingId },
    create: { meetingId, summary, keyPoints },
    update: { summary, keyPoints, updatedAt: new Date() },
  });

  logger.info(
    `Summary + key points generated in single call for meeting ${meetingId}`,
  );
  return { summary, keyPoints };
};

export const extractTasks = async (
  meetingId: string,
  transcriptText: string,
  userId: string,
): Promise<ExtractedTask[]> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("GEMINI_API_KEY is required for AI features", 503);
  }

  const capped = transcriptText.slice(0, MAX_PIPELINE_CHARS);
  const systemContent =
    "You extract tasks and action items from meeting transcripts and return them as JSON. Always respond in the same language as the transcript.";
  const prompt = `Extract ALL action items, tasks, follow-ups, and to-dos from this meeting transcript.
Respond in the same language as the transcript.
Be generous: include anything that sounds like something someone needs to do, follow up on, review, send, schedule, or decide.

Return a JSON array of objects with these fields:
- title: string (short, actionable task title in English)
- description: string (optional, more details)
- assigneeHint: string (optional, name/role of person responsible if mentioned)

If there are truly no action items, return [].

Transcript:
${capped}

Return ONLY a JSON array, no other text.`;

  const model = getGeminiModel();
  const result = await model.generateContent({
    systemInstruction: systemContent,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
  });

  const rawContent = result.response.text().trim();
  if (!rawContent) {
    throw new AppError("Gemini returned empty tasks content", 502);
  }

  logAIUsage({
    operation: "extractTasks",
    model: GEMINI_MODEL,
    promptChars: systemContent.length + prompt.length,
    completionChars: rawContent.length,
    usage: result.response.usageMetadata,
  });

  let rawTasks: Array<{
    title: string;
    description?: string;
    assigneeHint?: string;
  }>;
  try {
    rawTasks = JSON.parse(stripMarkdownJson(rawContent));
  } catch {
    logger.error("Failed to parse tasks JSON", {
      rawContent: rawContent.slice(0, 200),
    });
    throw new AppError("Failed to parse tasks JSON from Gemini response", 502);
  }

  const tasks: ExtractedTask[] = rawTasks.map((item) => ({
    title: item.title,
    description: item.description,
    assigneeHint: item.assigneeHint,
  }));

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

export const generateMeetingTitle = async (
  meetingId: string,
  transcriptText: string,
): Promise<string | null> => {
  if (!process.env.GEMINI_API_KEY) return null;

  let title: string | null = null;

  try {
    const systemContent =
      "You generate specific, descriptive meeting titles in English. Return only the title text — no quotes, no markdown, no labels like 'Title:'.";
    const prompt = `Read this meeting transcript carefully and write a specific 6-9 word title that describes exactly what was discussed.

Rules:
- Mention the actual subject matter (not just "AI" or "technology" — be specific)
- Include key topics, decisions, or people if relevant
- Never use generic words like "Meeting", "Discussion", "Exploring", "Talk", "Conversation"
- If transcript is in another language, still write title in English

Examples of GOOD titles: "Using Claude AI for Stock Market Research and Coding", "Q3 Product Roadmap Review with Engineering Team", "Onboarding New Sales Reps for Enterprise Accounts"
Examples of BAD titles: "AI Discussion", "Meeting About Technology", "Personal AI", "Team Sync"

Transcript:
${transcriptText.slice(0, 3000)}`;

    const model = getGeminiModel();
    const result = await model.generateContent({
      systemInstruction: systemContent,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 80, temperature: 0.5 },
    });

    title = result.response.text().trim() || null;

    logAIUsage({
      operation: "generateMeetingTitle",
      model: GEMINI_MODEL,
      promptChars: systemContent.length + prompt.length,
      completionChars: title?.length ?? 0,
      usage: result.response.usageMetadata,
    });
  } catch (err) {
    logger.error(`Gemini title generation failed for meeting ${meetingId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!title) return null;

  try {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { title },
    });
    logger.info(`Meeting ${meetingId} renamed to: "${title}"`);
  } catch (err) {
    logger.error(
      `DB write failed when saving generated title for meeting ${meetingId}`,
      {
        error: err instanceof Error ? err.message : String(err),
        title,
      },
    );
  }

  return title;
};

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

  const [existingSummary, existingTasks] = await Promise.all([
    prisma.meetingAISummary.findFirst({
      where: { meetingId, isDeleted: false },
      select: { summary: true, keyPoints: true },
    }),
    prisma.task.findMany({
      where: { meetingId, userId, source: "AI_EXTRACTED", isDeleted: false },
      select: { title: true, description: true },
      take: 100,
    }),
  ]);

  void generateMeetingTitle(meetingId, transcript.fullText).catch((err) =>
    logger.error("generateMeetingTitle failed (non-fatal)", {
      meetingId,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  let summary = existingSummary?.summary?.trim() || "";
  let keyPoints = Array.isArray(existingSummary?.keyPoints)
    ? (existingSummary?.keyPoints as string[]).filter(Boolean)
    : [];

  if (!summary) {
    const summaryAndKeyPoints = await generateSummaryAndKeyPoints(
      meetingId,
      transcript.fullText,
    );
    summary = summaryAndKeyPoints.summary;
    keyPoints = summaryAndKeyPoints.keyPoints;
  } else if (keyPoints.length === 0) {
    try {
      keyPoints = await extractKeyPoints(meetingId, transcript.fullText);
    } catch (err) {
      logger.error("extractKeyPoints failed during backfill (non-fatal)", {
        meetingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (keyPoints.length === 0 && summary) {
    const fallbackKeyPoints = deriveKeyPointsFromSummary(summary);
    if (fallbackKeyPoints.length > 0) {
      keyPoints = fallbackKeyPoints;
      await prisma.meetingAISummary.upsert({
        where: { meetingId },
        create: { meetingId, summary, keyPoints },
        update: { keyPoints, updatedAt: new Date() },
      });
      logger.info("Derived fallback key points from summary", {
        meetingId,
        count: keyPoints.length,
      });
    }
  }

  let tasks: ExtractedTask[] = existingTasks.map((task) => ({
    title: task.title,
    description: task.description ?? undefined,
  }));
  if (tasks.length === 0) {
    try {
      tasks = await extractTasks(meetingId, transcript.fullText, userId);
    } catch (taskErr) {
      logger.error("extractTasks failed (non-fatal)", {
        meetingId,
        error: taskErr instanceof Error ? taskErr.message : String(taskErr),
      });
    }
  }

  return { summary, keyPoints, tasks };
};

const ASK_AI_RATE_LIMIT = 20;

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
    logger.warn("Redis unavailable for Ask AI rate limit check", { userId });
  }
};

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

const QUESTION_STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "with", "from", "this", "that",
  "about", "were", "have", "does", "please", "could", "would", "should",
  "into", "your", "their", "there", "meeting", "transcript",
]);

const buildRelevantAskAIContext = (
  rawTranscript: string,
  question: string,
  maxChars: number,
): string => {
  if (rawTranscript.length <= maxChars) return rawTranscript;

  const terms = Array.from(
    new Set(
      question
        .toLowerCase()
        .match(/[a-z0-9]{4,}/g)
        ?.filter((term) => !QUESTION_STOP_WORDS.has(term)) ?? [],
    ),
  );

  if (terms.length === 0) {
    return `${rawTranscript.slice(0, maxChars)}\n[transcript truncated]`;
  }

  const lines = rawTranscript.split("\n").filter(Boolean);
  const scored = lines
    .map((line, index) => {
      const normalized = line.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (normalized.includes(term)) score += 1;
      }
      return { index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (scored.length === 0) {
    return `${rawTranscript.slice(0, maxChars)}\n[transcript truncated]`;
  }

  const selectedIndexes = new Set<number>();
  for (const item of scored) {
    selectedIndexes.add(item.index);
    if (item.index + 1 < lines.length) {
      selectedIndexes.add(item.index + 1);
    }
    if (selectedIndexes.size >= 220) break;
  }

  const orderedIndexes = Array.from(selectedIndexes).sort((a, b) => a - b);
  let context = "";
  for (const index of orderedIndexes) {
    const nextLine = `${lines[index]}\n`;
    if ((context + nextLine).length > maxChars) break;
    context += nextLine;
  }

  if (!context) {
    return `${rawTranscript.slice(0, maxChars)}\n[transcript truncated]`;
  }

  return `${context.trim()}\n[relevance-filtered transcript context]`;
};

export const askAI = async (
  meetingId: string,
  userId: string,
  question: string,
  res: Response,
): Promise<void> => {
  await checkAskAIRateLimit(userId);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true, title: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  // No segment cap — Gemini 1M context handles full meetings
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { isDeleted: false, recording: { meetingId, isDeleted: false } },
    select: {
      id: true,
      segments: {
        orderBy: { startTime: "asc" },
        select: { speaker: true, text: true, startTime: true },
      },
    },
  });

  if (!transcript || transcript.segments.length === 0) {
    throw new AppError("No transcript available for this meeting", 400);
  }

  const speakers = await prisma.meetingSpeaker.findMany({
    where: { meetingId },
    select: { speakerLabel: true, displayName: true },
  });

  const rawTranscript = buildTranscriptContext(transcript.segments, speakers);
  const transcriptContext = buildRelevantAskAIContext(
    rawTranscript,
    question,
    MAX_ASK_AI_CHARS,
  );

  const systemPrompt = `You are an intelligent meeting assistant. You have access to the full transcript of a meeting titled "${meeting.title ?? "Untitled Meeting"}".
Answer the user's questions based solely on the transcript content.
Be concise, accurate, and helpful. If the answer isn't in the transcript, say so clearly.`;

  const userMessage = `Transcript:\n${transcriptContext}\n\nQuestion: ${question}`;

  const conversationId = await conversationService.getOrCreateConversation(
    userId,
    meetingId,
  );

  const priorMessages = await conversationService.getMessages(userId, meetingId);

  // Gemini uses "model" role instead of "assistant"
  const historyMessages = priorMessages
    .slice(-6)
    .map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

  const historyChars = priorMessages
    .slice(-6)
    .reduce((acc, m) => acc + m.content.length, 0);
  const askAIPromptChars =
    systemPrompt.length + userMessage.length + historyChars;

  await conversationService.appendMessage(conversationId, "user", question);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const model = getGeminiModel();

  try {
    let streamedCompletionChars = 0;
    let fullAssistantResponse = "";

    const streamResult = await model.generateContentStream({
      systemInstruction: systemPrompt,
      contents: [
        ...historyMessages,
        { role: "user", parts: [{ text: userMessage }] },
      ],
      generationConfig: { maxOutputTokens: 900, temperature: 0.5 },
    });

    for await (const chunk of streamResult.stream) {
      const delta = chunk.text();
      if (delta) {
        streamedCompletionChars += delta.length;
        fullAssistantResponse += delta;
        res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
      }
    }

    logAIUsage({
      operation: "askAI:stream",
      model: GEMINI_MODEL,
      promptChars: askAIPromptChars,
      completionChars: streamedCompletionChars,
      streamed: true,
    });

    const estimatedInputTokens = Math.ceil(askAIPromptChars / 4);
    const estimatedOutputTokens = Math.ceil(streamedCompletionChars / 4);
    await checkAndDeductCredits(
      userId,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    if (fullAssistantResponse) {
      await conversationService.appendMessage(
        conversationId,
        "assistant",
        fullAssistantResponse,
      );
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

const CONTENT_PROMPTS: Record<AIContentType, (transcript: string) => string> =
  {
    MEETING_REPORT: (t) =>
      `Based on this meeting transcript, write a formal meeting report/minutes document. Include: Participants (from who's speaking), Key Discussion Points, Decisions Made, and Action Items. Format it professionally with clear sections.\n\nTranscript:\n${t}\n\nMeeting Report:`,

    TWEET: (t) =>
      `Write a short social media post (under 280 characters) that captures the main outcome or topic of this meeting. Be engaging and professional.\n\nTranscript excerpt:\n${t.slice(0, 3000)}\n\nSocial Media Post:`,

    BLOG_POST: (t) =>
      `Write a 300-400 word blog post about the topic discussed in this meeting. Give it a compelling title. Make it engaging and informative for a professional audience.\n\nTranscript:\n${t}\n\nBlog Post:`,

    EMAIL: (t) =>
      `Write a professional follow-up email to send to meeting participants. Include: brief summary of what was discussed, key decisions made, action items (with owners if mentioned), and a professional closing. Write only the email body — no subject line or headers.\n\nTranscript:\n${t}\n\nFollow-up Email:`,
  };

export const generateContent = async (
  meetingId: string,
  userId: string,
  type: AIContentType,
): Promise<string> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("GEMINI_API_KEY is required for AI features", 500);
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

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

  const capped = transcript.fullText.slice(0, MAX_PIPELINE_CHARS);
  const prompt = CONTENT_PROMPTS[type](capped);
  const systemContent =
    "You are a professional meeting assistant that generates well-structured content from meeting transcripts. Be concise, accurate, and professional.";

  const model = getGeminiModel();
  const result = await model.generateContent({
    systemInstruction: systemContent,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: type === "TWEET" ? 100 : 1500,
      temperature: 0.6,
    },
  });

  const content = result.response.text().trim();
  if (!content) {
    throw new AppError("Gemini returned empty content", 502);
  }

  const usage = result.response.usageMetadata;

  logAIUsage({
    operation: `generateContent:${type}`,
    model: GEMINI_MODEL,
    promptChars: systemContent.length + prompt.length,
    completionChars: content.length,
    usage,
  });

  await checkAndDeductCredits(
    userId,
    usage?.promptTokenCount ??
      Math.ceil((systemContent.length + prompt.length) / 4),
    usage?.candidatesTokenCount ?? Math.ceil(content.length / 4),
  );

  await prisma.meetingAIContent.upsert({
    where: { meetingId_type: { meetingId, type } },
    create: { meetingId, type, content },
    update: { content, updatedAt: new Date() },
  });

  logger.info(`Generated ${type} content for meeting ${meetingId}`);
  return content;
};

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
  generateSummaryAndKeyPoints,
  extractTasks,
  generateMeetingTitle,
  processTranscriptWithAI,
  askAI,
  generateContent,
  getGeneratedContents,
};
