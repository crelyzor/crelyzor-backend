/**
 * Phase 6 P5.8 — GET /teams/:teamId/usage controller.
 *
 * ADMIN+ only. Returns per-member breakdown + aggregate summary for the
 * team's consumption against the team owner's plan limits.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { TeamRole } from "@prisma/client";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { teamIdParamSchema } from "../validators/teamSchema";
import { getRole } from "../services/teamService";
import { getTeamUsage } from "../services/teamUsageService";

// Only "current" is supported until a UserUsageHistory table is added.
const usageQuerySchema = z.object({
  period: z.literal("current").optional(),
});

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

export const getUsage = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);
  const query = usageQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError("Invalid period parameter", 400);

  // Uniform 404 for non-members so we don't enumerate teams.
  const role = await getRole(actorId, params.data.teamId);
  if (!role) throw new AppError("Team not found", 404);
  if (ROLE_RANK[role] < ROLE_RANK.ADMIN) {
    // MEMBER cannot see team usage breakdown.
    throw new AppError("Team not found", 404);
  }

  const usage = await getTeamUsage(params.data.teamId);
  return apiResponse(res, {
    statusCode: 200,
    message: "Team usage fetched",
    data: usage,
  });
};
