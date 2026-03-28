import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";
import { apiResponse } from "../utils/globalResponseHandler";
import { AppError } from "../utils/errors/AppError";
import { createTaskSchema, createStandaloneTaskSchema, updateTaskSchema, listTasksQuerySchema } from "../validators/taskSchema";
import type { Prisma } from "@prisma/client";

const uuidSchema = z.string().uuid();

/**
 * GET /sma/tasks — all tasks for the authenticated user, with filters and pagination
 *
 * Query params: status, priority, source, meetingId, hasMeeting, dueBefore, dueAfter,
 *               limit, offset, sortBy, sortOrder
 */
export const getAllTasks = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = listTasksQuerySchema.safeParse(req.query);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { status, priority, source, meetingId, hasMeeting, dueBefore, dueAfter, limit, offset, sortBy, sortOrder } = validated.data;

  // Build dynamic where clause
  const where: Prisma.TaskWhereInput = { userId, isDeleted: false };

  if (status === "completed") where.isCompleted = true;
  else if (status === "pending") where.isCompleted = false;

  if (priority) where.priority = priority;
  if (source) where.source = source;
  if (meetingId) where.meetingId = meetingId;
  if (hasMeeting === true) where.meetingId = { not: null };
  else if (hasMeeting === false) where.meetingId = null;

  if (dueBefore || dueAfter) {
    where.dueDate = {
      ...(dueBefore ? { lte: dueBefore } : {}),
      ...(dueAfter ? { gte: dueAfter } : {}),
    };
  }

  // Build orderBy — priority needs custom mapping since enum order isn't alphabetical
  let orderBy: Prisma.TaskOrderByWithRelationInput[];
  if (sortBy === "priority") {
    // Prisma sorts enums by declaration order: LOW=0, MEDIUM=1, HIGH=2
    // For desc (high first), we reverse: desc gives HIGH first
    orderBy = [{ priority: sortOrder }, { createdAt: "desc" }];
  } else if (sortBy === "dueDate") {
    // Tasks without due dates go last
    orderBy = [{ dueDate: { sort: sortOrder, nulls: "last" } }, { createdAt: "desc" }];
  } else {
    orderBy = [{ createdAt: sortOrder }];
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        meeting: { select: { id: true, title: true, type: true } },
        taskTags: {
          where: { tag: { isDeleted: false } },
          select: {
            tag: { select: { id: true, name: true, color: true } },
          },
          orderBy: { tag: { name: "asc" } },
        },
      },
    }),
    prisma.task.count({ where }),
  ]);

  // Flatten taskTags into a tags array
  const tasksWithTags = tasks.map(({ taskTags, ...task }) => ({
    ...task,
    tags: taskTags.map((tt) => tt.tag),
  }));

  return apiResponse(res, {
    statusCode: 200,
    message: "Tasks fetched",
    data: { tasks: tasksWithTags, pagination: { total, limit, offset } },
  });
};

/**
 * GET /sma/meetings/:meetingId/tasks
 */
export const getTasks = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success) throw new AppError("Invalid meetingId", 400);
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
  if (!uuidSchema.safeParse(meetingId).success) throw new AppError("Invalid meetingId", 400);
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

  const { title, description, dueDate, scheduledTime, priority } = validated.data;

  const task = await prisma.task.create({
    data: {
      meetingId,
      userId,
      title,
      description,
      dueDate,
      scheduledTime,
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
 * POST /sma/tasks — create a standalone task (meetingId optional)
 */
export const createStandaloneTask = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = createStandaloneTaskSchema.safeParse(req.body);
  if (!validated.success) {
    throw new AppError("Validation failed", 400);
  }

  const { title, description, dueDate, scheduledTime, priority, meetingId } = validated.data;

  if (meetingId) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, createdById: userId, isDeleted: false },
      select: { id: true },
    });

    if (!meeting) {
      throw new AppError("Meeting not found", 404);
    }
  }

  const task = await prisma.task.create({
    data: {
      userId,
      title,
      description,
      dueDate,
      scheduledTime,
      priority,
      source: "MANUAL",
      ...(meetingId && { meetingId }),
    },
  });

  logger.info("Standalone task created", { taskId: task.id, meetingId: meetingId ?? null, userId });

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
  if (!uuidSchema.safeParse(taskId).success) throw new AppError("Invalid taskId", 400);
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

  const { title, description, isCompleted, dueDate, scheduledTime, priority } = validated.data;

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
      ...(scheduledTime !== undefined && { scheduledTime }),
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
  if (!uuidSchema.safeParse(taskId).success) throw new AppError("Invalid taskId", 400);
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
