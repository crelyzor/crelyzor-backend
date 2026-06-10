import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  createTeamSchema,
  updateTeamSchema,
  transferOwnershipSchema,
  teamIdParamSchema,
} from "../validators/teamSchema";
import * as teamService from "../services/teamService";

const checkSlugQuerySchema = z.object({
  slug: z.string().min(1).max(60),
});

export const create = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Invalid team payload", 400);

  const team = await teamService.createTeam(userId, parsed.data);

  return apiResponse(res, {
    statusCode: 201,
    message: "Team created",
    data: { team },
  });
};

export const getOne = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const team = await teamService.getTeamById(userId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Team fetched",
    data: { team },
  });
};

export const listMine = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teams = await teamService.listMyTeams(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Teams fetched",
    data: { teams },
  });
};

export const update = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);
  const body = updateTeamSchema.safeParse(req.body);
  if (!body.success) throw new AppError("Invalid team payload", 400);

  const team = await teamService.updateTeam(
    userId,
    params.data.teamId,
    body.data,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Team updated",
    data: { team },
  });
};

export const remove = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  await teamService.deleteTeam(userId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Team deleted",
  });
};

export const checkSlug = async (req: Request, res: Response) => {
  const query = checkSlugQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError("Invalid slug", 400);

  const available = await teamService.isSlugAvailable(query.data.slug);

  return apiResponse(res, {
    statusCode: 200,
    message: "Slug availability checked",
    data: { slug: query.data.slug, available },
  });
};

export const transferOwnership = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);
  const body = transferOwnershipSchema.safeParse(req.body);
  if (!body.success) throw new AppError("Invalid transfer payload", 400);

  const team = await teamService.transferOwnership(
    userId,
    params.data.teamId,
    body.data,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Team ownership transferred",
    data: { team },
  });
};
