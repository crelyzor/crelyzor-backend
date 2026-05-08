import type { Plan } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";

// ─── Plan Limits ────────────────────────────────────────────────────────────

export interface PlanLimits {
  transcriptionMinutes: number; // -1 = unlimited
  recallHours: number; // -1 = unlimited
  aiCredits: number; // -1 = unlimited
  storageGb: number; // -1 = unlimited
}

/**
 * Returns resource limits for a given plan.
 * -1 indicates unlimited (BUSINESS plan).
 */
export function getLimitsForPlan(plan: Plan): PlanLimits {
  switch (plan) {
    case "FREE":
      return {
        transcriptionMinutes: 120,
        recallHours: 0,
        aiCredits: 50,
        storageGb: 2,
      };
    case "PRO":
      return {
        transcriptionMinutes: 600,
        recallHours: 5,
        aiCredits: 1000,
        storageGb: 20,
      };
    case "BUSINESS":
      return {
        transcriptionMinutes: -1,
        recallHours: -1,
        aiCredits: -1,
        storageGb: -1,
      };
  }
}

// ─── Credit Formula ──────────────────────────────────────────────────────────

/**
 * Convert OpenAI token counts to AI Credits.
 * Formula from pricing doc: credits = (inputTokens × 0.00075) + (outputTokens × 0.0045)
 * Rounded up to nearest integer. Minimum 1 credit per call.
 */
export function calculateCredits(
  inputTokens: number,
  outputTokens: number,
): number {
  // Gemini 2.0 Flash: $0.10/1M input, $0.40/1M output. 1 credit = $0.001.
  const raw = inputTokens * 0.0001 + outputTokens * 0.0004;
  return Math.max(1, Math.ceil(raw));
}

// ─── Fetch or Create UserUsage ────────────────────────────────────────────────

/**
 * Returns the current period's usage record for a user. Creates one if it
 * doesn't exist yet (e.g. new user who hasn't triggered any billable action).
 *
 * resetAt is set to midnight on the 1st of next month (UTC).
 */
export async function getUserUsage(userId: string) {
  const existing = await prisma.userUsage.findUnique({ where: { userId } });
  if (existing) return existing;

  const resetAt = getNextMonthStart();
  return prisma.userUsage.create({
    data: {
      userId,
      resetAt,
    },
  });
}

function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

// ─── Helper: fetch plan + usage together ─────────────────────────────────────

async function getPlanAndUsage(userId: string) {
  const [user, usage] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
    getUserUsage(userId),
  ]);
  if (!user) throw new AppError("User not found", 404);
  const limits = getLimitsForPlan(user.plan);
  return { plan: user.plan, usage, limits };
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Throws 402 if the user has exceeded their monthly transcription minutes.
 * Call BEFORE starting a Deepgram transcription job.
 */
export async function checkTranscription(
  userId: string,
  estimatedMinutes: number,
): Promise<void> {
  const { limits, usage } = await getPlanAndUsage(userId);
  if (limits.transcriptionMinutes === -1) return; // unlimited

  const wouldExceed =
    usage.transcriptionMinutesUsed + estimatedMinutes >
    limits.transcriptionMinutes;
  if (wouldExceed) {
    logger.warn("Transcription limit reached", {
      userId,
      used: usage.transcriptionMinutesUsed,
      limit: limits.transcriptionMinutes,
      requested: estimatedMinutes,
    });
    throw new AppError("TRANSCRIPTION_LIMIT_REACHED", 402);
  }
}

/**
 * Deducts actual transcription minutes after a successful Deepgram call.
 * Call AFTER transcription succeeds. Fail-open: logs error but never throws.
 */
export async function deductTranscription(
  userId: string,
  actualMinutes: number,
): Promise<void> {
  try {
    await prisma.userUsage.update({
      where: { userId },
      data: {
        transcriptionMinutesUsed: { increment: Math.ceil(actualMinutes) },
      },
    });
    logger.info("Transcription minutes deducted", {
      userId,
      minutes: Math.ceil(actualMinutes),
    });
  } catch (err) {
    logger.error("Failed to deduct transcription minutes (non-fatal)", {
      userId,
      minutes: actualMinutes,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Recall.ai ────────────────────────────────────────────────────────────────

/**
 * Throws 402 if the user has exceeded their monthly Recall hours.
 * Call BEFORE deploying a Recall bot. estimatedHours is typically the
 * meeting duration in hours (e.g. 1.0 for a 60-min meeting).
 */
export async function checkRecall(
  userId: string,
  estimatedHours: number,
): Promise<void> {
  const { limits, usage } = await getPlanAndUsage(userId);

  if (limits.recallHours === -1) return; // unlimited (BUSINESS)

  if (limits.recallHours === 0) {
    // FREE plan — Recall not available
    throw new AppError("RECALL_LIMIT_REACHED", 402);
  }

  const wouldExceed =
    usage.recallHoursUsed + estimatedHours > limits.recallHours;
  if (wouldExceed) {
    logger.warn("Recall hours limit reached", {
      userId,
      used: usage.recallHoursUsed,
      limit: limits.recallHours,
      requested: estimatedHours,
    });
    throw new AppError("RECALL_LIMIT_REACHED", 402);
  }
}

/**
 * Deducts Recall hours after a bot session completes.
 * Fail-open: logs error but never throws.
 */
export async function deductRecall(
  userId: string,
  actualHours: number,
): Promise<void> {
  try {
    await prisma.userUsage.update({
      where: { userId },
      data: { recallHoursUsed: { increment: actualHours } },
    });
    logger.info("Recall hours deducted", { userId, hours: actualHours });
  } catch (err) {
    logger.error("Failed to deduct Recall hours (non-fatal)", {
      userId,
      hours: actualHours,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── AI Credits ───────────────────────────────────────────────────────────────

/**
 * Checks credit limit then deducts credits atomically after an OpenAI call.
 *
 * - Call AFTER the OpenAI response so we have real token counts.
 * - Uses actual `response.usage.prompt_tokens` + `completion_tokens`.
 * - Throws 402 (AI_CREDITS_EXHAUSTED) if user has no credits remaining BEFORE
 *   the call (pre-check uses current balance vs limit).
 * - Deduction fails-open so a DB hiccup never blocks the user's response.
 *
 * @param inputTokens   prompt_tokens from OpenAI response
 * @param outputTokens  completion_tokens from OpenAI response
 */
export async function checkAndDeductCredits(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    const { limits, usage } = await getPlanAndUsage(userId);

    if (limits.aiCredits === -1) return; // unlimited (BUSINESS)

    // Pre-check: if already at limit, throw before deducting
    if (usage.aiCreditsUsed >= limits.aiCredits) {
      throw new AppError("AI_CREDITS_EXHAUSTED", 402);
    }

    const creditsToDeduct = calculateCredits(inputTokens, outputTokens);

    await prisma.userUsage.update({
      where: { userId },
      data: { aiCreditsUsed: { increment: creditsToDeduct } },
    });

    logger.info("AI credits deducted", {
      userId,
      creditsDeducted: creditsToDeduct,
      totalUsed: usage.aiCreditsUsed + creditsToDeduct,
      limit: limits.aiCredits,
      inputTokens,
      outputTokens,
    });
  } catch (err) {
    if (err instanceof AppError) throw err; // re-throw 402s
    // DB/unexpected error — fail open so user still gets their response
    logger.error("Failed to check/deduct AI credits (non-fatal)", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Monthly Reset ────────────────────────────────────────────────────────────

/**
 * Resets all usage counters for a single user.
 * Called by the MONTHLY_USAGE_RESET cron job.
 */
export async function resetUserUsage(userId: string): Promise<void> {
  const nextResetAt = getNextMonthStart();
  await prisma.userUsage.update({
    where: { userId },
    data: {
      transcriptionMinutesUsed: 0,
      recallHoursUsed: 0,
      aiCreditsUsed: 0,
      periodStart: new Date(),
      resetAt: nextResetAt,
    },
  });
}

/**
 * Resets all users whose resetAt has passed.
 * Called by the MONTHLY_USAGE_RESET cron job processor.
 * Returns the count of users reset.
 */
export async function runMonthlyReset(): Promise<number> {
  const now = new Date();
  const nextResetAt = getNextMonthStart();

  const usersToReset = await prisma.userUsage.findMany({
    where: { resetAt: { lte: now } },
    select: { userId: true },
  });

  if (usersToReset.length === 0) {
    logger.info("Monthly usage reset: no users to reset");
    return 0;
  }

  await prisma.userUsage.updateMany({
    where: { resetAt: { lte: now } },
    data: {
      transcriptionMinutesUsed: 0,
      recallHoursUsed: 0,
      aiCreditsUsed: 0,
      periodStart: now,
      resetAt: nextResetAt,
    },
  });

  logger.info(`Monthly usage reset: ${usersToReset.length} users reset`, {
    nextResetAt: nextResetAt.toISOString(),
  });

  return usersToReset.length;
}

export const usageService = {
  getLimitsForPlan,
  calculateCredits,
  getUserUsage,
  checkTranscription,
  deductTranscription,
  checkRecall,
  deductRecall,
  checkAndDeductCredits,
  resetUserUsage,
  runMonthlyReset,
};
