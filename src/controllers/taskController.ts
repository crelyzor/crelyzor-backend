import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";
import { apiResponse } from "../utils/globalResponseHandler";
import { AppError } from "../utils/errors/AppError";
import {
  createTaskSchema,
  createStandaloneTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  reorderTasksSchema,
} from "../validators/taskSchema";
import type { Prisma } from "@prisma/client";
import {
  createTaskBlock,
  deleteCalendarEvent,
} from "../services/googleCalendarService";

const uuidSchema = z.string().uuid();

// Shared include for task list responses
const taskInclude = {
  meeting: { select: { id: true, title: true, type: true } },
  taskTags: {
    where: { tag: { isDeleted: false } },
    select: { tag: { select: { id: true, name: true, color: true } } },
    orderBy: { tag: { name: "asc" } },
  },
  card: { select: { id: true, displayName: true, slug: true } },
} satisfies Prisma.TaskInclude;

function flattenTags<T extends { taskTags: Array<{ tag: { id: string; name: string; color: string } }> }>(
  task: T
) {
  const { taskTags, ...rest } = task;
  return { ...rest, tags: taskTags.map((tt) => tt.tag) };
}

/**
 * GET /sma/tasks — all tasks for the authenticated user, with filters, views, and pagination
 */
export const getAllTasks = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = listTasksQuerySchema.safeParse(req.query);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { status, view, priority, source, meetingId, cardId, hasMeeting, dueBefore, dueAfter, limit, offset, sortBy, sortOrder } = validated.data;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const where: Prisma.TaskWhereInput = { userId, isDeleted: false };

  // View param takes priority over status filter
  if (view) {
    switch (view) {
      case "inbox":
        where.dueDate = null;
        where.scheduledTime = null;
        break;
      case "today":
        // Today = due today OR overdue (all tasks with dueDate <= end of today)
        where.dueDate = { lte: endOfToday };
        where.status = { not: "DONE" };
        break;
      case "upcoming":
        // Next 7 days, starting tomorrow
        where.dueDate = { gte: startOfTomorrow, lte: sevenDaysFromNow };
        where.status = { not: "DONE" };
        break;
      case "from_meetings":
        where.meetingId = { not: null };
        where.meeting = { type: { not: "VOICE_NOTE" } };
        break;
      case "from_voice_notes":
        where.meetingId = { not: null };
        where.meeting = { type: "VOICE_NOTE" };
        break;
      case "all":
      default:
        break;
    }
  } else {
    // Legacy status filter
    if (status === "completed") where.isCompleted = true;
    else if (status === "pending") where.isCompleted = false;
  }

  if (priority) where.priority = priority;
  if (source) where.source = source;
  if (meetingId) where.meetingId = meetingId;
  if (cardId) where.cardId = cardId;
  if (hasMeeting === true) where.meetingId = { not: null };
  else if (hasMeeting === false) where.meetingId = null;

  if (dueBefore || dueAfter) {
    where.dueDate = {
      ...(dueBefore ? { lte: dueBefore } : {}),
      ...(dueAfter ? { gte: dueAfter } : {}),
    };
  }

  let orderBy: Prisma.TaskOrderByWithRelationInput[];
  if (sortBy === "priority") {
    orderBy = [{ priority: sortOrder }, { createdAt: "desc" }];
  } else if (sortBy === "dueDate") {
    orderBy = [{ dueDate: { sort: sortOrder, nulls: "last" } }, { createdAt: "desc" }];
  } else if (sortBy === "sortOrder") {
    orderBy = [{ sortOrder: sortOrder }, { createdAt: "desc" }];
  } else {
    orderBy = [{ createdAt: sortOrder }];
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy, take: limit, skip: offset, include: taskInclude }),
    prisma.task.count({ where }),
  ]);

  // For upcoming view, group by date
  const tasksWithTags = tasks.map(flattenTags);

  if (view === "upcoming") {
    const grouped: Record<string, typeof tasksWithTags> = {};
    for (const task of tasksWithTags) {
      const dateKey = task.dueDate
        ? new Date(task.dueDate).toISOString().split("T")[0]
        : "no-date";
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(task);
    }
    const groupedArray = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => ({ date, tasks }));
    return apiResponse(res, {
      statusCode: 200,
      message: "Tasks fetched",
      data: { grouped: groupedArray, pagination: { total, limit, offset } },
    });
  }

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

  if (!meeting) throw new AppError("Meeting not found", 404);

  const tasks = await prisma.task.findMany({
    where: { meetingId, userId, isDeleted: false },
    orderBy: { createdAt: "asc" },
  });

  return apiResponse(res, { statusCode: 200, message: "Tasks fetched", data: { tasks } });
};

/**
 * POST /sma/meetings/:meetingId/tasks
 */
export const createTask = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success) throw new AppError("Invalid meetingId", 400);
  const userId = req.user!.userId;

  const validated = createTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) throw new AppError("Meeting not found", 404);

  const { title, description, dueDate, scheduledTime, priority, durationMinutes } = validated.data;

  const task = await prisma.task.create({
    data: { meetingId, userId, title, description, dueDate, scheduledTime, priority, source: "MANUAL", ...(durationMinutes !== undefined && { durationMinutes }) },
  });

  logger.info("Task created", { taskId: task.id, meetingId, userId });

  return apiResponse(res, { statusCode: 201, message: "Task created", data: { task } });
};

/**
 * POST /sma/tasks — create a standalone task (meetingId optional)
 */
export const createStandaloneTask = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = createStandaloneTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { title, description, dueDate, scheduledTime, priority, meetingId, parentTaskId, cardId, status, transcriptContext, durationMinutes } = validated.data;

  // Verify meeting ownership if meetingId provided
  if (meetingId) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, createdById: userId, isDeleted: false },
      select: { id: true },
    });
    if (!meeting) throw new AppError("Meeting not found", 404);
  }

  // Verify parent task ownership if parentTaskId provided
  if (parentTaskId) {
    const parent = await prisma.task.findFirst({
      where: { id: parentTaskId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!parent) throw new AppError("Parent task not found", 404);
  }

  // Verify card ownership if cardId provided
  if (cardId) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!card) throw new AppError("Card not found", 404);
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
      ...(status && { status }),
      ...(meetingId && { meetingId }),
      ...(parentTaskId && { parentTaskId }),
      ...(cardId && { cardId }),
      ...(transcriptContext && { transcriptContext }),
      ...(durationMinutes !== undefined && { durationMinutes }),
    },
  });

  logger.info("Standalone task created", { taskId: task.id, userId });

  return apiResponse(res, { statusCode: 201, message: "Task created", data: { task } });
};

/**
 * PATCH /sma/tasks/:taskId
 */
export const updateTask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success) throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;

  const validated = updateTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: {
      id: true,
      isCompleted: true,
      status: true,
      googleEventId: true,
      scheduledTime: true,
      title: true,
      durationMinutes: true,
    },
  });

  if (!existing) throw new AppError("Task not found", 404);

  const { title, description, isCompleted, dueDate, scheduledTime, priority, status, cardId, transcriptContext, durationMinutes, blockInCalendar } = validated.data;

  // Verify card ownership if cardId is being set (not cleared)
  if (cardId !== null && cardId !== undefined) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!card) throw new AppError("Card not found", 404);
  }

  // Derive completion state — keep isCompleted and status in sync
  let resolvedIsCompleted = isCompleted;
  let resolvedStatus = status;
  let completedAt: Date | null | undefined;

  if (status === "DONE" && !existing.isCompleted) {
    resolvedIsCompleted = true;
    completedAt = new Date();
  } else if (status === "TODO" || status === "IN_PROGRESS") {
    resolvedIsCompleted = false;
    completedAt = null;
  } else if (isCompleted === true && existing.status !== "DONE") {
    resolvedStatus = "DONE";
    completedAt = new Date();
  } else if (isCompleted === false && existing.status === "DONE") {
    resolvedStatus = "TODO";
    completedAt = null;
  }

  // When scheduledTime is explicitly cleared, also clear any existing GCal block
  const clearingScheduledTime = scheduledTime === null && !!existing.googleEventId;

  let task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(resolvedIsCompleted !== undefined && { isCompleted: resolvedIsCompleted }),
      ...(completedAt !== undefined && { completedAt }),
      ...(dueDate !== undefined && { dueDate }),
      ...(scheduledTime !== undefined && { scheduledTime }),
      ...(priority !== undefined && { priority }),
      ...(resolvedStatus !== undefined && { status: resolvedStatus }),
      ...(cardId !== undefined && { cardId }),
      ...(transcriptContext !== undefined && { transcriptContext }),
      ...(durationMinutes !== undefined && { durationMinutes }),
      // Clear googleEventId when scheduledTime is explicitly removed
      ...(clearingScheduledTime && { googleEventId: null }),
    },
  });

  // ── GCal block side-effects (fail-open — never block the task update) ────────

  if (clearingScheduledTime) {
    // scheduledTime cleared → delete existing GCal block
    await deleteCalendarEvent(userId, existing.googleEventId);
  } else if (blockInCalendar === true) {
    // Request to create/replace a GCal block
    const finalScheduledTime =
      scheduledTime !== undefined ? scheduledTime : existing.scheduledTime;

    if (finalScheduledTime) {
      // Delete existing block first (replace semantics)
      if (existing.googleEventId) {
        await deleteCalendarEvent(userId, existing.googleEventId);
      }
      const finalDuration =
        durationMinutes !== undefined && durationMinutes !== null
          ? durationMinutes
          : (existing.durationMinutes ?? 30);
      const finalTitle = title !== undefined ? title : existing.title;

      const eventId = await createTaskBlock(userId, {
        title: finalTitle,
        scheduledTime: finalScheduledTime,
        durationMinutes: finalDuration,
      });

      if (eventId) {
        task = await prisma.task.update({
          where: { id: taskId },
          data: { googleEventId: eventId },
        });
        logger.info("Task GCal block created", { taskId, userId, eventId });
      }
    }
  } else if (blockInCalendar === false && existing.googleEventId) {
    // Request to remove the GCal block without clearing scheduledTime
    await deleteCalendarEvent(userId, existing.googleEventId);
    task = await prisma.task.update({
      where: { id: taskId },
      data: { googleEventId: null },
    });
    logger.info("Task GCal block removed", { taskId, userId });
  }

  logger.info("Task updated", { taskId, userId });

  return apiResponse(res, { statusCode: 200, message: "Task updated", data: { task } });
};

/**
 * DELETE /sma/tasks/:taskId
 * Soft-deletes the task and cascades to its direct subtasks.
 */
export const deleteTask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success) throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;

  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!existing) throw new AppError("Task not found", 404);

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Soft-delete parent
    await tx.task.update({
      where: { id: taskId },
      data: { isDeleted: true, deletedAt: now },
    });
    // Cascade soft-delete to direct subtasks
    await tx.task.updateMany({
      where: { parentTaskId: taskId, userId, isDeleted: false },
      data: { isDeleted: true, deletedAt: now },
    });
  }, { timeout: 15000 });

  logger.info("Task deleted", { taskId, userId });

  return apiResponse(res, { statusCode: 200, message: "Task deleted" });
};

/**
 * PATCH /sma/tasks/reorder — bulk update sortOrder for drag-and-drop
 */
export const reorderTasks = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const validated = reorderTasksSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { taskIds } = validated.data;

  await prisma.$transaction(async (tx) => {
    // Verify all IDs belong to this user in one query
    const owned = await tx.task.findMany({
      where: { id: { in: taskIds }, userId, isDeleted: false },
      select: { id: true },
    });

    if (owned.length !== taskIds.length) {
      throw new AppError("One or more tasks not found", 404);
    }

    // Apply sort order — userId in where as a second ownership guard
    await Promise.all(
      taskIds.map((id, index) =>
        tx.task.update({
          where: { id, userId },
          data: { sortOrder: index },
        })
      )
    );
  }, { timeout: 15000 });

  logger.info("Tasks reordered", { userId, count: taskIds.length });

  return apiResponse(res, { statusCode: 200, message: "Tasks reordered" });
};

/**
 * GET /sma/tasks/:taskId/subtasks
 */
export const getSubtasks = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success) throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;

  // Verify parent task belongs to this user
  const parent = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!parent) throw new AppError("Task not found", 404);

  const subtasks = await prisma.task.findMany({
    where: { parentTaskId: taskId, userId, isDeleted: false },
    orderBy: { sortOrder: "asc" },
    include: taskInclude,
  });

  return apiResponse(res, {
    statusCode: 200,
    message: "Subtasks fetched",
    data: { subtasks: subtasks.map(flattenTags) },
  });
};

/**
 * POST /sma/tasks/:taskId/subtasks
 */
export const createSubtask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success) throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;

  // Verify parent task ownership before attaching a child
  const parent = await prisma.task.findFirst({
    where: { id: taskId, userId, isDeleted: false },
    select: { id: true },
  });

  if (!parent) throw new AppError("Task not found", 404);

  const validated = createTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { title, description, dueDate, scheduledTime, priority, durationMinutes } = validated.data;

  const subtask = await prisma.task.create({
    data: {
      userId, // always from req.user — never from body
      parentTaskId: taskId,
      title,
      description,
      dueDate,
      scheduledTime,
      priority,
      source: "MANUAL",
      ...(durationMinutes !== undefined && { durationMinutes }),
    },
  });

  logger.info("Subtask created", { subtaskId: subtask.id, parentTaskId: taskId, userId });

  return apiResponse(res, { statusCode: 201, message: "Subtask created", data: { task: subtask } });
};
