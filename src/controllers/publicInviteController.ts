import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { tokenParamSchema } from "../validators/teamSchema";
import * as teamInviteService from "../services/teamInviteService";

export const getByToken = async (req: Request, res: Response) => {
  const params = tokenParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid invite token", 400);

  const invite = await teamInviteService.getInviteByToken(params.data.token);

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite fetched",
    data: invite,
  });
};

export const acceptByToken = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = tokenParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid invite token", 400);

  const result = await teamInviteService.acceptInviteByToken(
    actorId,
    params.data.token,
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite accepted",
    data: result,
  });
};

export const declineByToken = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = tokenParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid invite token", 400);

  await teamInviteService.declineInviteByToken(actorId, params.data.token);

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite declined",
  });
};
