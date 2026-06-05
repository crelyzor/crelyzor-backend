import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { teamIdParamSchema } from "../validators/teamSchema";
import * as teamCardService from "../services/teamCardService";

export const getCards = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const data = await teamCardService.getTeamCards(params.data.teamId, actorId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Team cards fetched",
    data,
  });
};
