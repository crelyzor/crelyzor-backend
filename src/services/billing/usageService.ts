import { Plan, Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { getQuotaOwner } from "./quotaService";

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

// ─── Phase 6 P5.8 — UserUsage scope split ───────────────────────────────────
//
// Each user has multiple UserUsage rows after P5.8:
//   - `(userId, teamId: null)` — the user's PERSONAL pool. Created lazily.
//   - `(userId, teamId: <teamId>)` — one row per team the user OWNS, used
//     when a team admin/member runs work that bills against the team
//     owner (via getQuotaOwner). Created lazily.
//
// Two access patterns:
//   - **Check (aggregate)**: limits cap TOTAL consumption across all rows
//     for the payer. `getAggregateUsage(payerId)` sums every row.
//   - **Deduct (scoped)**: writes land on the specific `(payerId, scopeTeamId)`
//     row via `getOrCreateScopedUsage`. Multiple team writes don't
//     overwrite each other; the usage endpoint can break down per team.
//
// The semantics are documented at every read/write site so the next
// reader doesn't confuse the two.

type ScopedUsageRow = {
  id: string;
  userId: string;
  teamId: string | null;
  transcriptionMinutesUsed: number;
  recallHoursUsed: number;
  aiCreditsUsed: number;
  storageGbUsed: number;
  periodStart: Date;
  resetAt: Date;
  updatedAt: Date;
};

function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Phase 6 P5.8 — get-or-create the UserUsage row for a specific scope.
 *
 * Race-safe via try/catch on the partial unique violation (P2002). The
 * partial unique indexes (`UserUsage_user_personal_unique` and
 * `UserUsage_user_team_unique`) are invisible to Prisma's compound-key
 * upsert, so we fall back to findFirst → create → P2002 fallback.
 */
async function getOrCreateScopedUsage(
  userId: string,
  teamId: string | null,
): Promise<ScopedUsageRow> {
  const existing = await prisma.userUsage.findFirst({
    where: { userId, teamId },
  });
  if (existing) return existing;
  try {
    return await prisma.userUsage.create({
      data: { userId, teamId, resetAt: getNextMonthStart() },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Lost the race vs a concurrent create — fetch the row that won.
      const retry = await prisma.userUsage.findFirst({
        where: { userId, teamId },
      });
      if (retry) return retry;
    }
    throw err;
  }
}

/**
 * Phase 6 P5.8 — aggregate consumption across every row for a payer.
 *
 * Used by every CHECK function: the payer's plan limit caps TOTAL
 * consumption (personal + every team they own). Returns zero values
 * if the payer has no rows yet.
 */
async function getAggregateUsage(payerId: string): Promise<{
  transcriptionMinutesUsed: number;
  recallHoursUsed: number;
  aiCreditsUsed: number;
  storageGbUsed: number;
}> {
  const agg = await prisma.userUsage.aggregate({
    where: { userId: payerId },
    _sum: {
      transcriptionMinutesUsed: true,
      recallHoursUsed: true,
      aiCreditsUsed: true,
      storageGbUsed: true,
    },
  });
  return {
    transcriptionMinutesUsed: agg._sum.transcriptionMinutesUsed ?? 0,
    recallHoursUsed: agg._sum.recallHoursUsed ?? 0,
    aiCreditsUsed: agg._sum.aiCreditsUsed ?? 0,
    storageGbUsed: agg._sum.storageGbUsed ?? 0,
  };
}

/**
 * Returns the actor's aggregate usage + their plan's limits + a reset
 * timestamp. Drives `GET /billing/usage` and any in-context indicator
 * that needs to render a single bar per resource.
 *
 * P5.8 — shape preserved for backward compat. `periodStart` and `resetAt`
 * pull from the actor's personal row (creating it lazily if missing) so
 * the response always has values. Team rows can have different resetAt
 * dates (created at different times) but we surface the personal row's
 * cycle as the user's canonical "your month resets on X."
 */
export async function getUserUsage(userId: string): Promise<{
  transcriptionMinutesUsed: number;
  recallHoursUsed: number;
  aiCreditsUsed: number;
  storageGbUsed: number;
  periodStart: Date;
  resetAt: Date;
}> {
  const [aggregate, personal] = await Promise.all([
    getAggregateUsage(userId),
    getOrCreateScopedUsage(userId, null),
  ]);
  return {
    ...aggregate,
    periodStart: personal.periodStart,
    resetAt: personal.resetAt,
  };
}

// ─── Helper: fetch plan + aggregate usage together ───────────────────────────

async function getPlanAndUsage(userId: string) {
  const [user, usage] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
    getAggregateUsage(userId),
  ]);
  if (!user) throw new AppError("User not found", 404);
  const limits = getLimitsForPlan(user.plan);
  return { plan: user.plan, usage, limits };
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Phase 6 P5.1.c — billing options accepted by every check/deduct call.
 * When `teamId` is set, `getQuotaOwner` resolves the team owner as the
 * payer; the underlying UserUsage row belongs to the owner, not the actor.
 * After Phase 6 P5.8 the team's consumption lands on a SEPARATE row from
 * the owner's personal pool (`(payerId, teamId)` vs `(payerId, null)`).
 */
export interface MeteringOpts {
  teamId?: string | null;
}

/**
 * Throws 402 if the **payer** has exceeded their monthly transcription
 * minutes. Call BEFORE starting a Deepgram transcription job.
 *
 * `opts.teamId` set → payer = team owner (via getQuotaOwner).
 * `opts.teamId` null/omitted → payer = actor.
 *
 * P5.8: check aggregates across ALL the payer's rows. The limit covers
 * personal + every team they own.
 */
export async function checkTranscription(
  userId: string,
  estimatedMinutes: number,
  opts?: MeteringOpts,
): Promise<void> {
  const scopeTeamId = opts?.teamId ?? null;
  const payerId = await getQuotaOwner({ userId, teamId: scopeTeamId });
  const { limits, usage } = await getPlanAndUsage(payerId);
  if (limits.transcriptionMinutes === -1) return; // unlimited

  const wouldExceed =
    usage.transcriptionMinutesUsed + estimatedMinutes >
    limits.transcriptionMinutes;
  if (wouldExceed) {
    logger.warn("Transcription limit reached", {
      payerId,
      actorId: userId,
      teamId: scopeTeamId,
      used: usage.transcriptionMinutesUsed,
      limit: limits.transcriptionMinutes,
      requested: estimatedMinutes,
    });
    throw new AppError("TRANSCRIPTION_LIMIT_REACHED", 402);
  }
}

/**
 * Deducts actual transcription minutes after a successful Deepgram call
 * to the **payer's `(payerId, scopeTeamId)` row**. Fail-open.
 *
 * P5.8: deduct lands on the scoped row so the team usage endpoint can
 * report per-team breakdown later.
 */
export async function deductTranscription(
  userId: string,
  actualMinutes: number,
  opts?: MeteringOpts,
): Promise<void> {
  const scopeTeamId = opts?.teamId ?? null;
  try {
    const payerId = await getQuotaOwner({ userId, teamId: scopeTeamId });
    const row = await getOrCreateScopedUsage(payerId, scopeTeamId);
    await prisma.userUsage.update({
      where: { id: row.id },
      data: {
        transcriptionMinutesUsed: { increment: Math.ceil(actualMinutes) },
      },
    });
    logger.info("Transcription minutes deducted", {
      payerId,
      actorId: userId,
      teamId: scopeTeamId,
      minutes: Math.ceil(actualMinutes),
    });
  } catch (err) {
    logger.error("Failed to deduct transcription minutes (non-fatal)", {
      actorId: userId,
      teamId: scopeTeamId,
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
 *
 * P5.8: same aggregate-check semantics as transcription.
 */
export async function checkRecall(
  userId: string,
  estimatedHours: number,
  opts?: MeteringOpts,
): Promise<void> {
  const scopeTeamId = opts?.teamId ?? null;
  const payerId = await getQuotaOwner({ userId, teamId: scopeTeamId });
  const { limits, usage } = await getPlanAndUsage(payerId);

  if (limits.recallHours === -1) return; // unlimited (BUSINESS)

  if (limits.recallHours === 0) {
    // FREE plan — Recall not available
    throw new AppError("RECALL_LIMIT_REACHED", 402);
  }

  const wouldExceed =
    usage.recallHoursUsed + estimatedHours > limits.recallHours;
  if (wouldExceed) {
    logger.warn("Recall hours limit reached", {
      payerId,
      actorId: userId,
      teamId: scopeTeamId,
      used: usage.recallHoursUsed,
      limit: limits.recallHours,
      requested: estimatedHours,
    });
    throw new AppError("RECALL_LIMIT_REACHED", 402);
  }
}

/**
 * Deducts Recall hours to the **payer's `(payerId, scopeTeamId)` row**
 * after a bot session completes. Fail-open.
 */
export async function deductRecall(
  userId: string,
  actualHours: number,
  opts?: MeteringOpts,
): Promise<void> {
  const scopeTeamId = opts?.teamId ?? null;
  try {
    const payerId = await getQuotaOwner({ userId, teamId: scopeTeamId });
    const row = await getOrCreateScopedUsage(payerId, scopeTeamId);
    await prisma.userUsage.update({
      where: { id: row.id },
      data: { recallHoursUsed: { increment: actualHours } },
    });
    logger.info("Recall hours deducted", {
      payerId,
      actorId: userId,
      teamId: scopeTeamId,
      hours: actualHours,
    });
  } catch (err) {
    logger.error("Failed to deduct Recall hours (non-fatal)", {
      actorId: userId,
      teamId: scopeTeamId,
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
 *   the call (pre-check uses current aggregate balance vs limit).
 * - Deduction fails-open so a DB hiccup never blocks the user's response.
 *
 * P5.8: check against payer aggregate; deduct to the scoped row.
 *
 * @param inputTokens   prompt_tokens from OpenAI response
 * @param outputTokens  completion_tokens from OpenAI response
 */
export async function checkAndDeductCredits(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  opts?: MeteringOpts,
): Promise<void> {
  const scopeTeamId = opts?.teamId ?? null;
  try {
    const payerId = await getQuotaOwner({ userId, teamId: scopeTeamId });
    const { limits, usage } = await getPlanAndUsage(payerId);

    if (limits.aiCredits === -1) return; // unlimited (BUSINESS)

    // Pre-check: if already at limit, throw before deducting
    if (usage.aiCreditsUsed >= limits.aiCredits) {
      throw new AppError("AI_CREDITS_EXHAUSTED", 402);
    }

    const creditsToDeduct = calculateCredits(inputTokens, outputTokens);

    const row = await getOrCreateScopedUsage(payerId, scopeTeamId);
    await prisma.userUsage.update({
      where: { id: row.id },
      data: { aiCreditsUsed: { increment: creditsToDeduct } },
    });

    logger.info("AI credits deducted", {
      payerId,
      actorId: userId,
      teamId: scopeTeamId,
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
      actorId: userId,
      teamId: scopeTeamId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Monthly Reset ────────────────────────────────────────────────────────────

/**
 * Resets ALL usage rows for a single user (across personal + every team
 * they own). Called by the admin reset endpoint.
 *
 * P5.8: changed from `update` to `updateMany` to cover multi-row case.
 */
export async function resetUserUsage(userId: string): Promise<void> {
  const nextResetAt = getNextMonthStart();
  await prisma.userUsage.updateMany({
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
 * Returns the count of rows reset.
 *
 * P5.8 note: each scoped row resets independently. Multi-row users (with
 * teams) get every due row reset on the same cron pass.
 */
export async function runMonthlyReset(): Promise<number> {
  const now = new Date();
  const nextResetAt = getNextMonthStart();

  const dueCount = await prisma.userUsage.count({
    where: { resetAt: { lte: now } },
  });

  if (dueCount === 0) {
    logger.info("Monthly usage reset: no rows to reset");
    return 0;
  }

  const result = await prisma.userUsage.updateMany({
    where: { resetAt: { lte: now } },
    data: {
      transcriptionMinutesUsed: 0,
      recallHoursUsed: 0,
      aiCreditsUsed: 0,
      periodStart: now,
      resetAt: nextResetAt,
    },
  });

  logger.info(`Monthly usage reset: ${result.count} rows reset`, {
    nextResetAt: nextResetAt.toISOString(),
  });

  return result.count;
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
  // Phase 6 P5.8 — exposed for the team usage endpoint.
  getOrCreateScopedUsage,
  getAggregateUsage,
};
