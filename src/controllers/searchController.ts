import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { searchQuerySchema } from "../validators/searchSchema";
import * as searchService from "../services/searchService";

/**
 * GET /search?q=<query>
 */
export const search = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = searchQuerySchema.safeParse(req.query);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { q } = validated.data;
  const results = await searchService.globalSearch(userId, q);

  return apiResponse(res, {
    statusCode: 200,
    message: "Search results",
    data: results,
  });
};
