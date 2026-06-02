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

// Phase 6 P13 — invitee-side discovery of their own pending invites. Used by
// the workspace switcher dropdown + notifications panel to surface invites
// that arrived while the user was offline (the WS event only delivers to
// open tabs).
export const listMine = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const invites = await teamInviteService.listMyPendingInvites(userId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Pending invites fetched",
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

// ── Invite link (Phase 6 P16) ─────────────────────────────────────────────

export const getInviteLink = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const data = await teamInviteService.getInviteLink(actorId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite link fetched",
    data,
  });
};

export const generateInviteLink = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  const data = await teamInviteService.generateInviteLink(actorId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 201,
    message: "Invite link generated",
    data,
  });
};

export const revokeInviteLink = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const params = teamIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid team id", 400);

  await teamInviteService.revokeInviteLink(actorId, params.data.teamId);

  return apiResponse(res, {
    statusCode: 200,
    message: "Invite link revoked",
  });
};

export const joinByLink = async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const token = req.params.token as string;
  if (!token) throw new AppError("Missing invite token", 400);

  const data = await teamInviteService.joinByLink(actorId, token);

  return apiResponse(res, {
    statusCode: 200,
    message: "Joined team",
    data,
  });
};
