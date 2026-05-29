import type { Request } from "express";
import { AppError } from "../utils/errors/AppError";
import type { TeamContext } from "./authMiddleware";

// UUID v4-ish — same shape Zod uses for `:teamId` params. Reused by every
// callsite that handles a teamId from an external source (header, param).
export const TEAM_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Typed accessor for `req.teamContext`.
 *
 * - Returns `null` when the request was scoped to the user's personal
 *   workspace (no `X-Team-Id` header, or middleware deliberately set null).
 * - Returns the `TeamContext` when the request was scoped to a team.
 * - **Throws** if the request reaches the accessor with `req.teamContext`
 *   strictly `undefined` — that means `resolveTeamContext` was not mounted
 *   in the middleware chain for this route. Failing loud at the accessor
 *   surfaces the developer error in dev/staging instead of silently
 *   treating the request as personal.
 */
export function getTeamContext(req: Request): TeamContext | null {
  if (req.teamContext === undefined) {
    throw new AppError(
      "getTeamContext called on a route that did not mount resolveTeamContext",
      500,
    );
  }
  return req.teamContext;
}
