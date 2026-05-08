import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  adminLoginSchema,
  adminListUsersSchema,
  adminUpdatePlanSchema,
  adminInviteSchema,
  adminAcceptInviteSchema,
} from "../validators/adminSchema";
import {
  adminLogin,
  listUsers,
  getUserDetail,
  updateUserPlan,
  resetUserUsage,
  getPlatformStats,
  listAdmins,
  removeAdmin,
  sendInvite,
  validateInviteToken,
  acceptInvite,
} from "../services/adminService";

export const login = async (req: Request, res: Response) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Invalid credentials format", 400);

  const token = await adminLogin(parsed.data.email, parsed.data.password);
  return apiResponse(res, {
    statusCode: 200,
    message: "Admin login successful",
    data: { token },
  });
};

// ─── Team ────────────────────────────────────────────────────────────────────

export const getTeam = async (_req: Request, res: Response) => {
  const admins = await listAdmins();
  return apiResponse(res, {
    statusCode: 200,
    message: "Team fetched",
    data: { admins },
  });
};

export const deleteTeamMember = async (req: Request, res: Response) => {
  const { id } = req.params;
  await removeAdmin(id, req.adminId!);
  return apiResponse(res, { statusCode: 200, message: "Admin removed" });
};

export const invite = async (req: Request, res: Response) => {
  const parsed = adminInviteSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Invalid invite data", 400);

  const result = await sendInvite(
    parsed.data.email,
    parsed.data.name,
    req.adminId!,
  );
  return apiResponse(res, {
    statusCode: 201,
    message: "Invite sent",
    data: result,
  });
};

export const checkInvite = async (req: Request, res: Response) => {
  const { token } = req.params;
  const result = await validateInviteToken(token);
  return apiResponse(res, {
    statusCode: 200,
    message: "Invite valid",
    data: result,
  });
};

export const acceptInviteHandler = async (req: Request, res: Response) => {
  const parsed = adminAcceptInviteSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message, 400);

  const result = await acceptInvite(parsed.data.token, parsed.data.password);
  return apiResponse(res, {
    statusCode: 200,
    message: "Invite accepted",
    data: result,
  });
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const getUsers = async (req: Request, res: Response) => {
  const parsed = adminListUsersSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError("Invalid query params", 400);

  const result = await listUsers(
    parsed.data.page,
    parsed.data.limit,
    parsed.data.search,
  );
  return apiResponse(res, {
    statusCode: 200,
    message: "Users fetched",
    data: result,
  });
};

export const getUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await getUserDetail(id);
  return apiResponse(res, {
    statusCode: 200,
    message: "User fetched",
    data: result,
  });
};

export const updatePlan = async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = adminUpdatePlanSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Invalid plan value", 400);

  const updated = await updateUserPlan(id, parsed.data.plan);
  return apiResponse(res, {
    statusCode: 200,
    message: "User plan updated",
    data: updated,
  });
};

export const resetUsage = async (req: Request, res: Response) => {
  const { id } = req.params;
  const usage = await resetUserUsage(id);
  return apiResponse(res, {
    statusCode: 200,
    message: "User usage reset",
    data: usage,
  });
};

export const getStats = async (req: Request, res: Response) => {
  const stats = await getPlatformStats();
  return apiResponse(res, {
    statusCode: 200,
    message: "Platform stats fetched",
    data: stats,
  });
};
