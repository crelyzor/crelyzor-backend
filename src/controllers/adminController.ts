import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  adminLoginSchema,
  adminListUsersSchema,
  adminUpdatePlanSchema,
} from "../validators/adminSchema";
import {
  adminLogin,
  listUsers,
  getUserDetail,
  updateUserPlan,
  resetUserUsage,
  getPlatformStats,
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
