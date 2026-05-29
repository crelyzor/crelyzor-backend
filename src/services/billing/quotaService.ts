import type { Request } from "express";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";

// Symbol-keyed property on the Request object — Express allocates a fresh
// Request per HTTP request, so the cache lifetime is exactly the request
// lifetime. GC reclaims it with the Request. Symbol.for ensures the same
// symbol identity across modules that import this file.
const REQUEST_CACHE_KEY = Symbol.for("crelyzor.teamQuotaCache");

type QuotaCache = Map<string, Promise<string>>;

interface RequestWithQuotaCache extends Request {
  [REQUEST_CACHE_KEY]?: QuotaCache;
}

interface GetQuotaOwnerArgs {
  userId: string;
  teamId?: string | null;
  // Pass the Express Request to memoise the lookup for the duration of one
  // HTTP request. Optional — Bull workers and other non-HTTP entry points
  // skip caching (each job invocation does at most one resolution).
  req?: Request;
}

function getOrCreateRequestCache(req: Request): QuotaCache {
  const withCache = req as RequestWithQuotaCache;
  let cache = withCache[REQUEST_CACHE_KEY];
  if (!cache) {
    cache = new Map();
    withCache[REQUEST_CACHE_KEY] = cache;
  }
  return cache;
}

/**
 * Resolves the userId of the principal whose quota pool gets debited for a
 * given (userId, teamId?) pair.
 *
 * - `teamId` null or undefined → returns `userId` (personal workspace).
 * - `teamId` set + team is active → returns the team owner's userId.
 * - `teamId` set + team missing OR soft-deleted → **throws `AppError 410`**.
 *   We deliberately do NOT fall back to `userId` here: silent fallback would
 *   bill a per-user actor for work that was supposed to be charged to a
 *   team owner. For Bull workers this surfaces as a job-level failure that
 *   Bull can retry or dead-letter; for HTTP it surfaces as a 410 to the
 *   client. Either is preferable to a stale-attribution billing bug.
 *
 * Pass `req` to memoise the lookup across multiple `getQuotaOwner` calls in
 * the same HTTP request (e.g. transcription start + transcription deduct +
 * AI deduct all sharing the same team principal).
 */
export async function getQuotaOwner(args: GetQuotaOwnerArgs): Promise<string> {
  const { userId, teamId, req } = args;

  if (!teamId) return userId;

  const cacheKey = `${userId}:${teamId}`;
  const cache = req ? getOrCreateRequestCache(req) : null;
  if (cache) {
    const hit = cache.get(cacheKey);
    if (hit) return hit;
  }

  const resolved = (async () => {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      // Explicit select — never include wrappedDek/dekVersion/anything beyond
      // what's strictly needed for billing attribution.
      select: { ownerId: true, isDeleted: true },
    });

    if (!team || team.isDeleted) {
      logger.error("quotaService: team unavailable for billing attribution", {
        userId,
        teamId,
        teamFound: Boolean(team),
        isDeleted: team?.isDeleted ?? null,
      });
      throw new AppError("Team is not available for billing attribution", 410);
    }

    return team.ownerId;
  })();

  if (cache) cache.set(cacheKey, resolved);
  return resolved;
}
