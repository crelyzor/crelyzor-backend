/**
 * Phase 6 P6 — Public team controllers. No auth.
 */
import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  slugParamSchema,
  slugUsernameParamSchema,
  slugCardSlugParamSchema,
  slugUsernameCardSlugParamSchema,
} from "../validators/publicTeamSchema";
import {
  getPublicTeamProfile,
  getPublicTeamSchedulingProfile,
  getPublicTeamMemberSchedulingProfile,
  getPublicTeamCard,
  getPublicTeamMemberCard,
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

export const getTeamCard = async (req: Request, res: Response) => {
  const params = slugCardSlugParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid path parameters", 400);

  const data = await getPublicTeamCard(params.data.slug, params.data.cardSlug);
  return apiResponse(res, {
    statusCode: 200,
    message: "Team card fetched",
    data,
  });
};

export const getTeamMemberCard = async (req: Request, res: Response) => {
  const params = slugUsernameCardSlugParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid path parameters", 400);

  const data = await getPublicTeamMemberCard(
    params.data.slug,
    params.data.username,
    params.data.cardSlug,
  );
  return apiResponse(res, {
    statusCode: 200,
    message: "Member card fetched",
    data,
  });
};
