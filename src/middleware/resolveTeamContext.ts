import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors/AppError";
import { getRole } from "../services/teamService";
import { TEAM_ID_REGEX } from "./teamContext";

// Identical body across "no team context" / "team soft-deleted" / "team
// missing" / "not a member" — collapses the existence oracle the same way
// the team CRUD endpoints (P1) and member endpoints (P2.a) do.
const NOT_MEMBER_MESSAGE = "Not a member of this team";

/**
 * Reads `X-Team-Id` from the request and attaches `req.teamContext`.
 *
 * - Header absent → `req.teamContext = null`. Next middleware runs.
 * - Header present but malformed → 400 (input validation, not enumeration).
 * - Header valid + caller is an active member of a non-deleted team →
 *   `req.teamContext = { teamId, role }`.
 * - Header valid + caller is not a member (or team missing/soft-deleted) →
 *   403 with identical body shape.
 *
 * MUST be mounted after `verifyJWT` so `req.user.userId` is available.
 * Mount BEFORE any controller or `verifyTeamRole` middleware that reads
 * from `req.teamContext`.
 */
export async function resolveTeamContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = req.header("X-Team-Id");

    if (!raw) {
      req.teamContext = null;
      next();
      return;
    }

    if (!TEAM_ID_REGEX.test(raw)) {
      throw new AppError("Invalid X-Team-Id header", 400);
    }

    const userId = req.user?.userId;
    if (!userId) {
      // Defensive: verifyJWT should have already rejected this. If it didn't,
      // we cannot trust the X-Team-Id binding to anything.
      throw new AppError("Authentication required", 401);
    }

    const role = await getRole(userId, raw);
    if (!role) {
      throw new AppError(NOT_MEMBER_MESSAGE, 403);
    }

    req.teamContext = { teamId: raw, role };
    next();
  } catch (err) {
    next(err);
  }
}
