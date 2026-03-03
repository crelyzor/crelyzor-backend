import type { Request, Response } from "express";
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";
import { apiResponse } from "../utils/globalResponseHandler";
import { AppError } from "../utils/errors/AppError";
import { createTaskSchema, updateTaskSchema } from "../validators/taskSchema";

/**
 * GET /sma/meetings/:meetingId/tasks
 */
export const getTasks = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const userId = req.user!.userId;

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const tasks = await prisma.task.findMany({
    where: { meetingId, isDeleted: false },
    orderBy: { createdAt: "asc" },
  });

  return apiResponse(res, {
    statusCode: 200,
    message: "Tasks fetched",
    data: { tasks },
  });
};

/**
 * POST /sma/meetings/:meetingId/tasks
 */
export const createTask = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const userId = req.user!.userId;

  const validated = createTaskSchema.safeParse(req.body);
  if (!validated.success) {
    throw new AppError("Validation failed", 400);
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const { title, description, dueDate, priority } = validated.data;

  const task = await prisma.task.create({
    data: {
      meetingId,
      userId,
      title,
      description,
      dueDate,
      priority,
      source: "MANUAL",
    },
  });

  logger.info("Task created", { taskId: task.id, meetingId, userId });

  return apiResponse(res, {
    statusCode: 201,
    message: "Task created",
    data: { task },
  });
};

/**
 * PATCH /sma/tasks/:taskId
 */
export const updateTask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const userId = req.user!.userId;

  const validated = updateTaskSchema.safeParse(req.body);
  if (!validated.success) {
    throw new AppError("Validation failed", 400);
  }

  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: { id: true, isCompleted: true },
  });

  if (!existing) {
    throw new AppError("Task not found", 404);
  }

  const { title, description, isCompleted, dueDate, priority } = validated.data;

  const completedAt =
    isCompleted === true && !existing.isCompleted
      ? new Date()
      : isCompleted === false
        ? null
        : undefined;

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(isCompleted !== undefined && { isCompleted }),
      ...(completedAt !== undefined && { completedAt }),
      ...(dueDate !== undefined && { dueDate }),
      ...(priority !== undefined && { priority }),
    },
  });

  logger.info("Task updated", { taskId, userId });

  return apiResponse(res, {
    statusCode: 200,
    message: "Task updated",
    data: { task },
  });
};

/**
 * DELETE /sma/tasks/:taskId
 */
export const deleteTask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const userId = req.user!.userId;

  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError("Task not found", 404);
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Task deleted", { taskId, userId });

  return apiResponse(res, { statusCode: 200, message: "Task deleted" });
};
