import type { Request, Response, NextFunction } from "express";
import { TeamRole } from "@prisma/client";
import { AppError } from "../utils/errors/AppError";
import { getTeamContext } from "./teamContext";

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

// Identical 403 body — caller cannot distinguish "no team context" from
// "insufficient role". Same enumeration-collapse pattern as P1/P2.
const FORBIDDEN_MESSAGE = "Forbidden";

/**
 * Middleware factory: requires the request to be in team context AND the
 * caller's role to be at least `minRole`.
 *
 * MUST be mounted AFTER `resolveTeamContext` so `req.teamContext` is populated.
 * The `getTeamContext` accessor throws if `resolveTeamContext` is missing,
 * which surfaces middleware-ordering bugs at first request instead of
 * silently returning 403.
 *
 * For routes mounted under `/teams/:teamId/*`, controllers continue to use
 * the inline `getRole(actorId, teamId)` pattern from P1/P2 — there is no
 * `verifyTeamMember` route-param variant in this file. One source of truth
 * (`getRole`) keeps the membership semantics consistent.
 */
export function verifyTeamRole(minRole: "ADMIN" | "OWNER") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const ctx = getTeamContext(req);
      if (!ctx) {
        throw new AppError(FORBIDDEN_MESSAGE, 403);
      }
      if (ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) {
        throw new AppError(FORBIDDEN_MESSAGE, 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
