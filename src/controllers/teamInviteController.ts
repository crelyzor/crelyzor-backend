import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  createInviteSchema,
  inviteIdParamSchema,
  teamIdParamSchema,
} from "../validators/teamSchema";
import * as teamInviteService from "../services/teamInviteService";

export const create = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);
  const body = createInviteSchema.safeParse(req.body);
  if (!body.success) throw new AppError("Invalid invite payload", 400);

  const result = await teamInviteService.createInvites(
    actorId,
    params.data.teamId,
    body.data,
  );

  return apiResponse(res, {
    statusCode: 201,
    message: "Invites processed",
    data: result,
  });
};

export const list = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const invites = await teamInviteService.listInvites(
    actorId,
    params.data.teamId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Invites fetched",
    data: { invites },
  });
};

export const resend = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = inviteIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team or invite id", 400);

  const result = await teamInviteService.resendInvite(
    actorId,
    params.data.teamId,
    params.data.inviteId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite resent",
    data: result,
  });
};

export const cancel = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = inviteIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team or invite id", 400);

  await teamInviteService.cancelInvite(
    actorId,
    params.data.teamId,
    params.data.inviteId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite cancelled",
  });
};

export const acceptByTeam = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const result = await teamInviteService.acceptInviteByTeam(
    actorId,
    params.data.teamId,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite accepted",
    data: result,
  });
};

export const declineByTeam = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  await teamInviteService.declineInviteByTeam(actorId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite declined",
  });
};
