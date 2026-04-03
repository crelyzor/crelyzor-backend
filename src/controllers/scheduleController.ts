import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  createScheduleSchema,
  updateScheduleSchema,
  copyScheduleSchema,
  scheduleIdParamSchema,
  patchSlotsSchema,
  createScheduleOverrideSchema,
  scheduleOverrideParamSchema,
} from "../validators/scheduleSchema";
import * as scheduleService from "../services/scheduling/scheduleService";

// ── Schedule CRUD ──────────────────────────────────────────────────────────

export const listSchedules = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const schedules = await scheduleService.listSchedules(userId);
  return apiResponse(res, { statusCode: 200, message: "Schedules fetched", data: { schedules } });
};

export const createSchedule = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const validated = createScheduleSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const schedule = await scheduleService.createSchedule(userId, validated.data);
  return apiResponse(res, { statusCode: 201, message: "Schedule created", data: { schedule } });
};

export const updateSchedule = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const validated = updateScheduleSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const schedule = await scheduleService.updateSchedule(userId, params.data.id, validated.data);
  return apiResponse(res, { statusCode: 200, message: "Schedule updated", data: { schedule } });
};

export const deleteSchedule = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  await scheduleService.deleteSchedule(userId, params.data.id);
  return apiResponse(res, { statusCode: 200, message: "Schedule deleted" });
};

export const copySchedule = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const validated = copyScheduleSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const schedule = await scheduleService.copySchedule(userId, params.data.id, validated.data);
  return apiResponse(res, { statusCode: 201, message: "Schedule copied", data: { schedule } });
};

export const setDefaultSchedule = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const schedule = await scheduleService.setDefaultSchedule(userId, params.data.id);
  return apiResponse(res, { statusCode: 200, message: "Default schedule updated", data: { schedule } });
};

// ── Slots ──────────────────────────────────────────────────────────────────

export const getSlots = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const availability = await scheduleService.getSlots(userId, params.data.id);
  return apiResponse(res, { statusCode: 200, message: "Slots fetched", data: { availability } });
};

export const patchSlots = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const validated = patchSlotsSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  await scheduleService.patchSlots(userId, params.data.id, validated.data);
  const availability = await scheduleService.getSlots(userId, params.data.id);
  return apiResponse(res, { statusCode: 200, message: "Slots updated", data: { availability } });
};

// ── Overrides ────────────────────────────────────────────────────────────

export const getOverrides = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const overrides = await scheduleService.getOverrides(userId, params.data.id);
  return apiResponse(res, { statusCode: 200, message: "Overrides fetched", data: { overrides } });
};

export const createOverride = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid schedule ID", 400);

  const validated = createScheduleOverrideSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const override = await scheduleService.createOverride(userId, params.data.id, validated.data);
  return apiResponse(res, { statusCode: 201, message: "Override created", data: { override } });
};

export const deleteOverride = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const params = scheduleOverrideParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid ID", 400);

  await scheduleService.deleteOverride(userId, params.data.id, params.data.overrideId);
  return apiResponse(res, { statusCode: 200, message: "Override deleted" });
};
