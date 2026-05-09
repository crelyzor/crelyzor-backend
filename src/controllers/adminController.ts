import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import { logger } from "../utils/logging/logger";
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

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 2 * 60 * 60 * 1000, // 2 hours (matches JWT expiry)
};

export const login = async (req: Request, res: Response) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Invalid credentials format", 400);

  const token = await adminLogin(parsed.data.email, parsed.data.password);
  res.cookie("admin_token", token, COOKIE_OPTIONS);
  return apiResponse(res, { statusCode: 200, message: "Admin login successful" });
};

export const me = (req: Request, res: Response) => {
  const cookieToken = req.cookies?.admin_token as string | undefined;
  const authHeader = req.headers.authorization;
  const headerToken =
    authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const token = cookieToken ?? headerToken;

  if (!token) throw new AppError("Admin token required", 401);

  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    logger.error("ADMIN_JWT_SECRET is not set");
    throw new AppError("Admin portal not configured", 500);
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      role: string;
      adminId: string;
      email: string;
    };
    if (decoded.role !== "admin") throw new AppError("Insufficient permissions", 403);
    return apiResponse(res, {
      statusCode: 200,
      message: "Authenticated",
      data: { adminId: decoded.adminId, email: decoded.email },
    });
  } catch {
    throw new AppError("Invalid or expired admin token", 401);
  }
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie("admin_token", { path: "/" });
  return apiResponse(res, { statusCode: 200, message: "Logged out" });
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

  const { token: jwtToken } = await acceptInvite(parsed.data.token, parsed.data.password);
  res.cookie("admin_token", jwtToken, COOKIE_OPTIONS);
  return apiResponse(res, { statusCode: 200, message: "Invite accepted" });
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
