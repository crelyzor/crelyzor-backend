import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { getTeamContext } from "../middleware/teamContext";
import {
  meetingIdParamSchema,
  shortIdParamSchema,
  updateShareSchema,
} from "../validators/shareSchema";
import {
  createOrGetShare,
  getPublicMeetingByShortId,
  updateShare,
} from "../services/shareService";

/**
 * POST /sma/meetings/:meetingId/share
 * Create or return existing share for a meeting (idempotent).
 */
export const createShare = async (req: Request, res: Response) => {
  const params = meetingIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Meeting not found", 404);

  const userId = req.user!.userId;
  const share = await createOrGetShare(
    params.data.meetingId,
    userId,
    getTeamContext(req),
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Share fetched",
    data: { share },
  });
};

/**
 * PATCH /sma/meetings/:meetingId/share
 * Update share visibility and published field flags.
 */
export const patchShare = async (req: Request, res: Response) => {
  const params = meetingIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Meeting not found", 404);

  const body = updateShareSchema.safeParse(req.body);
  if (!body.success) throw new AppError("Validation failed", 400);

  const userId = req.user!.userId;
  const share = await updateShare(
    params.data.meetingId,
    userId,
    body.data,
    getTeamContext(req),
  );

  return apiResponse(res, {
    statusCode: 200,
    message: "Share updated",
    data: { share },
  });
};

/**
 * GET /public/meetings/:shortId
 * Public endpoint — returns published meeting content.
 * No auth required.
 */
export const getPublicMeeting = async (req: Request, res: Response) => {
  const params = shortIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid share ID", 400);

  const data = await getPublicMeetingByShortId(params.data.shortId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Meeting fetched",
    data,
  });
};
