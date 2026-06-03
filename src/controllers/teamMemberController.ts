import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  memberIdParamSchema,
  teamIdParamSchema,
  updateMemberRoleSchema,
  updateMemberDesignationSchema,
} from "../validators/teamSchema";
import * as teamMemberService from "../services/teamMemberService";

export const list = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const members = await teamMemberService.listMembers(
    actorId,
    params.data.teamId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Members fetched",
    data: { members },
  });
};

export const updateRole = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = memberIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team or user id", 400);
  const body = updateMemberRoleSchema.safeParse(req.body);
  if (!body.success) throw new AppError("Invalid role payload", 400);

  const member = await teamMemberService.changeMemberRole(
    actorId,
    params.data.teamId,
    params.data.userId,
    body.data,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Member role updated",
    data: { member },
  });
};

export const updateDesignation = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = memberIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team or user id", 400);
  const body = updateMemberDesignationSchema.safeParse(req.body);
  if (!body.success) throw new AppError("Invalid designation payload", 400);

  const member = await teamMemberService.updateDesignation(
    actorId,
    params.data.teamId,
    params.data.userId,
    body.data,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Member designation updated",
    data: { member },
  });
};

export const remove = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = memberIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team or user id", 400);

  await teamMemberService.removeMember(
    actorId,
    params.data.teamId,
    params.data.userId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Member removed",
  });
};

export const leave = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  await teamMemberService.leaveTeam(actorId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Left team",
  });
};
