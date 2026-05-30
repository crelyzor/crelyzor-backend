/**
 * Phase 6 P6 — Public team controllers. No auth.
 */
import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  slugParamSchema,
  slugUsernameParamSchema,
} from "../validators/publicTeamSchema";
import {
  getPublicTeamProfile,
  getPublicTeamSchedulingProfile,
  getPublicTeamMemberSchedulingProfile,
} from "../services/teamPublicService";

export const getTeamProfile = async (req: Request, res: Response) => {
  const params = slugParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team slug", 400);

  const profile = await getPublicTeamProfile(params.data.slug);
  return apiResponse(res, {
    statusCode: 200,
    message: "Team profile fetched",
    data: profile,
  });
};

export const getTeamSchedulingProfile = async (req: Request, res: Response) => {
  const params = slugParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team slug", 400);

  const profile = await getPublicTeamSchedulingProfile(params.data.slug);
  return apiResponse(res, {
    statusCode: 200,
    message: "Team scheduling profile fetched",
    data: profile,
  });
};

export const getTeamMemberSchedulingProfile = async (
  req: Request,
  res: Response,
) => {
  const params = slugUsernameParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid path parameters", 400);

  const profile = await getPublicTeamMemberSchedulingProfile(
    params.data.slug,
    params.data.username,
  );
  return apiResponse(res, {
    statusCode: 200,
    message: "Team member scheduling profile fetched",
    data: profile,
  });
};
